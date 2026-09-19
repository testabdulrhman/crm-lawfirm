import AVFoundation
import Speech
import SwiftUI

// الملاحظات الصوتية في النقاش (طلب المدير 2026-09-14: «في المناقشات ودي يكون فيه ارسال ملاحظة صوتية»).
// تُسجَّل AAC أحادية (نحو 360 ك.ب للدقيقة) وتُرفع مرفقاً عادياً في مخزن المستندات باسم
// «ملاحظة صوتية 0:42.m4a»: المدة في الاسم كي تظهر قبل التشغيل بلا تنزيل، والامتداد يكفي لتمييزها
// في التطبيق والويب — بلا أي تعديل في قاعدة البيانات. وm4a يُشغَّل في الآيفون وسفاري وكروم معاً.

enum VoiceNote {
    /// خمس دقائق — عند بلوغها يُرسل التسجيل تلقائياً
    static let maxSeconds = 300
    private static let audioExtensions: Set<String> = ["m4a", "mp3", "aac", "wav"]

    static func isAudio(_ name: String?) -> Bool {
        guard let name else { return false }
        return audioExtensions.contains((name as NSString).pathExtension.lowercased())
    }

    static func fileName(seconds: Int) -> String { "ملاحظة صوتية \(clock(seconds)).m4a" }

    /// المدة من اسم الملف («… 1:05.m4a») — nil لملف صوتي لم يُسجَّل من هنا
    static func duration(fromName name: String) -> Int? {
        let base = (name as NSString).deletingPathExtension
        guard let r = base.range(of: #"(\d+):(\d{2})$"#, options: .regularExpression) else { return nil }
        let parts = base[r].split(separator: ":")
        guard parts.count == 2, let m = Int(parts[0]), let s = Int(parts[1]) else { return nil }
        return m * 60 + s
    }

    static func clock(_ seconds: Int) -> String {
        let s = max(0, seconds)
        return "\(s / 60):" + String(format: "%02d", s % 60)
    }
}

// MARK: - التسجيل

@MainActor
final class VoiceRecorder: NSObject, ObservableObject, AVAudioRecorderDelegate {
    @Published private(set) var isRecording = false
    @Published private(set) var elapsed = 0
    /// مستوى الصوت 0…1 — يحرّك أعمدة التسجيل
    @Published private(set) var level: CGFloat = 0
    /// بلغ التسجيل حدّه فتوقف وحده — الشاشة ترسله كما هو
    @Published private(set) var limitReached = false

    private var recorder: AVAudioRecorder?
    private var timer: Timer?

    struct Failure: LocalizedError {
        let errorDescription: String?
    }

    func start() async throws {
        guard !isRecording else { return }
        guard await AVAudioApplication.requestRecordPermission() else {
            throw Failure(errorDescription: "اسمح للتطبيق باستعمال الميكروفون من الإعدادات لتسجيل ملاحظة صوتية")
        }
        VoicePlayer.shared.stop()
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
        try session.setActive(true)

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("voice-\(UUID().uuidString).m4a")
        let r = try AVAudioRecorder(url: url, settings: [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 48_000,
        ])
        r.delegate = self
        r.isMeteringEnabled = true
        guard r.record(forDuration: TimeInterval(VoiceNote.maxSeconds)) else {
            throw Failure(errorDescription: "تعذّر بدء التسجيل — أنهِ أي مكالمة جارية وحاول مجدداً")
        }
        recorder = r
        elapsed = 0
        level = 0
        limitReached = false
        isRecording = true
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    private func tick() {
        guard let r = recorder, r.isRecording else { return }
        elapsed = Int(r.currentTime)
        r.updateMeters()
        // -50 ديسيبل فأدنى صمت، و0 أعلى صوت
        level = CGFloat(max(0, min(1, (r.averagePower(forChannel: 0) + 50) / 50)))
    }

    /// يوقف التسجيل ويعيد الملف ومدته — nil إن كان أقصر من ثانية
    func finish() -> (url: URL, seconds: Int)? {
        guard let r = recorder else { return nil }
        let seconds = max(Int(r.currentTime.rounded()), elapsed)
        let url = r.url
        r.stop()
        reset()
        guard seconds >= 1 else {
            try? FileManager.default.removeItem(at: url)
            return nil
        }
        return (url, seconds)
    }

    func cancel() {
        guard let r = recorder else { return }
        r.stop()
        r.deleteRecording()
        reset()
    }

    private func reset() {
        timer?.invalidate()
        timer = nil
        recorder = nil
        isRecording = false
        level = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        Task { @MainActor in
            // الإيقاف اليدوي يصفّر الحالة قبل وصول هذا النداء؛ فإن بقي «يسجّل» فقد بلغ الحد
            if self.isRecording, self.recorder === recorder { self.limitReached = true }
        }
    }
}

// MARK: - التشغيل

/// مشغّل واحد للتطبيق كله — تشغيل ملاحظة يوقف السابقة
@MainActor
final class VoicePlayer: ObservableObject {
    static let shared = VoicePlayer()

    @Published private(set) var currentURL: String?
    @Published private(set) var isPlaying = false
    @Published private(set) var loading = false
    @Published private(set) var position: Double = 0
    @Published private(set) var duration: Double = 0
    @Published private(set) var failedURL: String?

    private var player: AVPlayer?
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?
    private var statusObserver: NSKeyValueObservation?

    func toggle(url: String, knownDuration: Int?) {
        if currentURL == url, let player {
            if isPlaying {
                player.pause()
                isPlaying = false
            } else {
                activateSession()
                player.play()
                isPlaying = true
            }
            return
        }
        stop()
        guard let remote = URL(string: url) else { return }
        activateSession()
        failedURL = nil

        let item = AVPlayerItem(url: remote)
        let p = AVPlayer(playerItem: item)
        player = p
        currentURL = url
        position = 0
        duration = Double(knownDuration ?? 0)
        loading = true

        timeObserver = p.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.1, preferredTimescale: 600), queue: .main
        ) { [weak self] time in
            MainActor.assumeIsolated {
                guard let self, self.player === p else { return }
                self.position = time.seconds
                let d = p.currentItem?.duration.seconds ?? 0
                if d.isFinite, d > 0 { self.duration = d }
                if p.timeControlStatus == .playing { self.loading = false }
            }
        }
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.player === p else { return }
                self.isPlaying = false
                self.position = 0
                p.seek(to: .zero)
            }
        }
        // رابط معطوب أو شبكة مقطوعة: لا يبقى الدوّار يدور بلا نهاية
        statusObserver = item.observe(\.status) { [weak self] item, _ in
            guard item.status == .failed else { return }
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    guard let self, self.player === p else { return }
                    self.stop()
                    self.failedURL = url
                }
            }
        }
        p.play()
        isPlaying = true
    }

    /// تنقّل داخل الملاحظة الجارية — نسبة من 0 إلى 1
    func seek(url: String, to fraction: Double) {
        guard currentURL == url, let player, duration > 0 else { return }
        let target = max(0, min(1, fraction)) * duration
        position = target
        player.seek(to: CMTime(seconds: target, preferredTimescale: 600))
    }

    func stop() {
        player?.pause()
        if let timeObserver { player?.removeTimeObserver(timeObserver) }
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        statusObserver?.invalidate()
        timeObserver = nil
        endObserver = nil
        statusObserver = nil
        player = nil
        currentURL = nil
        isPlaying = false
        loading = false
        position = 0
        duration = 0
    }

    private func activateSession() {
        // تُسمع ولو كان الجوال على الصامت — كالواتساب
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)
    }
}

// MARK: - الواجهة

/// المرفق داخل الفقاعة: ملاحظة صوتية تُشغَّل مكانها، وغيرها شريحة ملف
struct MessageAttachment: View {
    let name: String
    let url: String?

    var body: some View {
        if VoiceNote.isAudio(name) {
            VoiceNoteView(name: name, url: url)
        } else {
            AttachmentChip(name: name, url: url)
        }
    }
}

/// الملاحظة الصوتية: تشغيل/إيقاف، وشريط يُسحب للتنقل، والمدة
struct VoiceNoteView: View {
    let name: String
    let url: String?
    @ObservedObject private var player = VoicePlayer.shared

    private var isCurrent: Bool { url != nil && player.currentURL == url }
    private var knownSeconds: Int? { VoiceNote.duration(fromName: name) }

    private var fraction: Double {
        guard isCurrent, player.duration > 0 else { return 0 }
        return min(1, player.position / player.duration)
    }

    private var timeText: String {
        if isCurrent, player.isPlaying || player.position > 0 {
            return VoiceNote.clock(Int(player.position))
        }
        return knownSeconds.map(VoiceNote.clock) ?? "ملاحظة صوتية"
    }

    var body: some View {
        HStack(spacing: 10) {
            Button {
                if let url { player.toggle(url: url, knownDuration: knownSeconds) }
            } label: {
                ZStack {
                    Circle().fill(Theme.gold)
                    if isCurrent && player.loading {
                        ProgressView().tint(Theme.navy)
                    } else {
                        Image(systemName: isCurrent && player.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Theme.navy)
                    }
                }
                .frame(width: 38, height: 38)
            }
            .buttonStyle(.plain)
            .disabled(url == nil)
            .accessibilityLabel(isCurrent && player.isPlaying ? "إيقاف الملاحظة الصوتية مؤقتاً" : "تشغيل الملاحظة الصوتية")

            VStack(alignment: .leading, spacing: 2) {
                Slider(
                    value: Binding(
                        get: { fraction },
                        set: { f in
                            guard let url else { return }
                            if !isCurrent { player.toggle(url: url, knownDuration: knownSeconds) }
                            player.seek(url: url, to: f)
                        }
                    ),
                    in: 0...1
                )
                .tint(Theme.goldDark)
                .accessibilityLabel("موضع التشغيل")

                HStack(spacing: 4) {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 10))
                        .foregroundStyle(Theme.goldDark)
                    Text(timeText)
                        .font(.system(size: 11).monospacedDigit())
                        .foregroundStyle(Theme.muted)
                    if url != nil, player.failedURL == url {
                        Text("· تعذّر التشغيل — تحقق من الاتصال")
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.danger)
                    }
                }
            }
        }
        .frame(minWidth: 200)
    }
}

/// زر الميكروفون مكان الإرسال حين يفرغ حقل الكتابة
struct MicButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "mic.fill")
                .font(.system(size: 15))
                .foregroundStyle(Theme.navy)
                .frame(width: 36, height: 36)
                .background(Theme.gold)
                .clipShape(Circle())
        }
        .accessibilityLabel("تسجيل ملاحظة صوتية")
    }
}

/// شريط التسجيل مكان سطر الكتابة: إرسال · مؤقّت ومستوى الصوت · حذف
struct VoiceRecordingBar: View {
    @ObservedObject var recorder: VoiceRecorder
    let onSend: () -> Void
    let onCancel: () -> Void
    @State private var pulse = false

    var body: some View {
        HStack(spacing: 8) {
            // أول الكود يمين في RTL — الإرسال في مكانه المعتاد
            Button(action: onSend) {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.navy)
                    .frame(width: 36, height: 36)
                    .background(Theme.gold)
                    .clipShape(Circle())
            }
            .accessibilityLabel("إرسال الملاحظة الصوتية")

            HStack(spacing: 8) {
                Circle()
                    .fill(Theme.danger)
                    .frame(width: 9, height: 9)
                    .opacity(pulse ? 0.25 : 1)
                    .animation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true), value: pulse)
                Text(VoiceNote.clock(recorder.elapsed))
                    .font(.system(size: 14, weight: .semibold).monospacedDigit())
                    .foregroundStyle(Theme.navy)
                LevelMeter(level: recorder.level)
                Spacer(minLength: 4)
                Text("حتى \(VoiceNote.clock(VoiceNote.maxSeconds))")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(Theme.ivory)
            .clipShape(RoundedRectangle(cornerRadius: 18))

            Button(action: onCancel) {
                Image(systemName: "trash")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(Theme.danger)
                    .frame(width: 36, height: 36)
            }
            .accessibilityLabel("حذف التسجيل")
        }
        .onAppear { pulse = true }
    }
}

private struct LevelMeter: View {
    let level: CGFloat
    private let weights: [CGFloat] = [0.45, 0.8, 1, 0.7, 0.5]

    var body: some View {
        HStack(spacing: 2) {
            ForEach(weights.indices, id: \.self) { i in
                Capsule()
                    .fill(Theme.goldDark)
                    .frame(width: 3, height: 4 + 14 * level * weights[i])
            }
        }
        .frame(height: 18)
        .animation(.easeOut(duration: 0.1), value: level)
    }
}

// MARK: - نص الملاحظة (طلب المدير 2026-09-19: «عرض النص للرسالة مثل الواتس أب»)

/// يحوّل الملاحظة إلى نص على آيفون المُرسِل **بعد** إرسالها — فلا ينتظر المرسل شيئاً —
/// ثم يضعه في نص الرسالة نفسها، فيقرؤه الجميع في التطبيق والويب والبحث.
/// التحويل على الجهاز متى دعمه للعربية، وإلا عبر خدمة أبل (كإملاء الكيبورد) — لا جهة أخرى.
/// تعذّره لا يمسّ شيئاً: تبقى الرسالة صوتاً كما أُرسلت.
enum VoiceTranscriber {
    static func attach(messageId: String, fileURL: URL, sb: SB, onDone: @escaping @MainActor () -> Void) {
        Task.detached(priority: .utility) {
            defer { try? FileManager.default.removeItem(at: fileURL) }
            guard let text = await transcribe(fileURL), !text.isEmpty else { return }
            do {
                try await sb.setVoiceTranscript(messageId: messageId, text: text)
                await onDone()
            } catch {
                // ثانوي — الملاحظة نفسها وصلت
            }
        }
    }

    static func transcribe(_ url: URL) async -> String? {
        guard await authorized(),
              let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ar-SA")),
              recognizer.isAvailable
        else { return nil }
        // على الجهاز أولاً؛ وإن لم يكن نموذج العربية منزَّلاً عليه فعبر خدمة أبل
        if recognizer.supportsOnDeviceRecognition,
           let text = await run(recognizer, url: url, onDevice: true) {
            return text
        }
        return await run(recognizer, url: url, onDevice: false)
    }

    private static func run(_ recognizer: SFSpeechRecognizer, url: URL, onDevice: Bool) async -> String? {
        let request = SFSpeechURLRecognitionRequest(url: url)
        request.shouldReportPartialResults = false
        request.addsPunctuation = true
        request.requiresOnDeviceRecognition = onDevice
        request.taskHint = .dictation

        return await withCheckedContinuation { (cont: CheckedContinuation<String?, Never>) in
            var finished = false
            recognizer.recognitionTask(with: request) { result, error in
                guard !finished else { return }
                if let result, result.isFinal {
                    finished = true
                    let text = result.bestTranscription.formattedString
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    cont.resume(returning: text.isEmpty ? nil : text)
                } else if error != nil {
                    finished = true
                    cont.resume(returning: nil)
                }
            }
        }
    }

    private static func authorized() async -> Bool {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized: return true
        case .notDetermined:
            return await withCheckedContinuation { cont in
                SFSpeechRecognizer.requestAuthorization { cont.resume(returning: $0 == .authorized) }
            }
        default: return false
        }
    }
}

/// نص الملاحظة تحت مشغّلها — سطران مطويّان، ولمسة تفتحه كاملاً (كالواتساب)
struct VoiceTranscriptView: View {
    let text: String
    @State private var expanded = false

    var body: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) { expanded.toggle() }
        } label: {
            HStack(alignment: .top, spacing: 6) {
                Image(systemName: "text.quote")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.goldDark)
                    .padding(.top, 3)
                Text(text)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.navy.opacity(0.85))
                    .lineLimit(expanded ? nil : 2)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(Theme.goldPale, in: RoundedRectangle(cornerRadius: 10))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("نص الملاحظة الصوتية")
        .accessibilityValue(text)
    }
}
