import SwiftUI
import UIKit

// احتفالية الشاشة في الآيفون — مرآة celebrate.ts في الويب (طلب المدير 2026-09-27):
// انفجارات بألوان المكتب ثم قصاصات تتساقط، ثوانٍ وتختفي. لصاحب يوم الميلاد وحده، تلقائياً أول
// دخول في يومه ومن زرّ عائم متى شاء. ولا تنطلق مع «تقليل الحركة» في إعدادات الجهاز.

struct CelebrationView: UIViewRepresentable {
    /// كل تغيّر في القيمة يطلق احتفالية جديدة
    let trigger: Int

    func makeUIView(context: Context) -> CelebrationUIView {
        let v = CelebrationUIView()
        v.isUserInteractionEnabled = false
        v.backgroundColor = .clear
        return v
    }

    func updateUIView(_ v: CelebrationUIView, context: Context) {
        guard trigger > 0, trigger != v.lastTrigger else { return }
        v.lastTrigger = trigger
        v.fire()
    }
}

final class CelebrationUIView: UIView {
    var lastTrigger = 0

    private static let colors: [UIColor] = [
        UIColor(red: 0xC9 / 255, green: 0xA9 / 255, blue: 0x82 / 255, alpha: 1),  // الذهب الشامبين
        UIColor(red: 0xE6 / 255, green: 0xD2 / 255, blue: 0x9B / 255, alpha: 1),
        UIColor(red: 0xC9 / 255, green: 0xA8 / 255, blue: 0x4C / 255, alpha: 1),
        UIColor(red: 0x11 / 255, green: 0x1D / 255, blue: 0x3A / 255, alpha: 1),  // الكحلي
        UIColor(red: 0x2A / 255, green: 0x3C / 255, blue: 0x63 / 255, alpha: 1),
        .white,
    ]

    /// مستطيل صغير يُلوَّن لكل خلية (القصاصة)
    private static let piece: CGImage? = {
        let r = UIGraphicsImageRenderer(size: CGSize(width: 10, height: 6))
        return r.image { ctx in
            UIColor.white.setFill()
            UIBezierPath(roundedRect: CGRect(x: 0, y: 0, width: 10, height: 6), cornerRadius: 1.5).fill()
        }.cgImage
    }()

    private static let dot: CGImage? = {
        let r = UIGraphicsImageRenderer(size: CGSize(width: 7, height: 7))
        return r.image { _ in
            UIColor.white.setFill()
            UIBezierPath(ovalIn: CGRect(x: 0, y: 0, width: 7, height: 7)).fill()
        }.cgImage
    }()

    func fire() {
        guard !UIAccessibility.isReduceMotionEnabled, bounds.width > 0 else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        // انفجارات: ستة في مواضع عشوائية أعلى الشاشة، متتابعة
        for i in 0..<6 {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.45) { [weak self] in
                guard let self else { return }
                let x = CGFloat.random(in: i % 2 == 0 ? 0.12...0.42 : 0.58...0.88) * self.bounds.width
                let y = CGFloat.random(in: 0.14...0.40) * self.bounds.height
                self.burst(at: CGPoint(x: x, y: y))
            }
        }
        // الختام: قصاصات تتساقط من أعلى الشاشة
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.7) { [weak self] in self?.rain() }
    }

    private func cells(image: CGImage?, velocity: CGFloat, birth: Float, scale: CGFloat, spin: Bool) -> [CAEmitterCell] {
        Self.colors.map { c in
            let cell = CAEmitterCell()
            cell.contents = image
            // الصورة مرسومة بكثافة الشاشة — بدون هذا تُعرض بثلاثة أضعاف حجمها
            cell.contentsScale = UIScreen.main.scale
            cell.color = c.cgColor
            cell.birthRate = birth
            cell.lifetime = 3.2
            cell.velocity = velocity
            cell.velocityRange = velocity * 0.45
            cell.emissionRange = .pi * 2
            cell.yAcceleration = 180
            cell.scale = scale
            cell.scaleRange = scale * 0.4
            cell.alphaSpeed = -0.32
            if spin {
                cell.spin = 3
                cell.spinRange = 6
            }
            return cell
        }
    }

    private func burst(at p: CGPoint) {
        let e = CAEmitterLayer()
        e.emitterPosition = p
        e.emitterShape = .point
        e.renderMode = .additive
        e.emitterCells = cells(image: Self.dot, velocity: 230, birth: 40, scale: 0.9, spin: false)
        layer.addSublayer(e)
        // دفقة لحظية ثم يتوقف الإطلاق وتكمل الجسيمات مسارها
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { e.birthRate = 0 }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.6) { e.removeFromSuperlayer() }
    }

    private func rain() {
        let e = CAEmitterLayer()
        e.emitterPosition = CGPoint(x: bounds.midX, y: -10)
        e.emitterSize = CGSize(width: bounds.width, height: 1)
        e.emitterShape = .line
        let cs = cells(image: Self.piece, velocity: 150, birth: 9, scale: 1, spin: true)
        cs.forEach { $0.emissionLongitude = .pi; $0.emissionRange = .pi / 5; $0.lifetime = 5 }
        e.emitterCells = cs
        layer.addSublayer(e)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { e.birthRate = 0 }
        DispatchQueue.main.asyncAfter(deadline: .now() + 7) { e.removeFromSuperlayer() }
    }
}
