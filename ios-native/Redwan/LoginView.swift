import SwiftUI

// شاشة الدخول — نفس هوية شاشة الويب: كحلي عميق وميزان ذهبي واسم الشركة كاملاً.
// ⚠️ قاعدة ثابتة من المستخدم: اسم الشركة لا يُختصر في أي موضع.


/// الهندية → اللاتينية عند الإرسال — الخادم يطابق باللاتينية.
/// (التطبيع أثناء الكتابة يصادم تحرير الحقل فيُفقد الإدخال — جُرّب)
private func latinDigits(_ s: String) -> String {
    String(s.map { c -> Character in
        if let v = c.wholeNumberValue, (0...9).contains(v), !c.isASCII {
            return Character(String(v))
        }
        return c
    })
}

/// حقل أرقام يعمل في RTL: لوحات الأرقام في iOS لا ترسم المكتوب أثناء
/// الكتابة داخل تطبيق عربي الاتجاه (علّة نظام — جُرّبت كل الأنواع في
/// المحاكي 2026-08-22)، فنجعل نص الحقل شفافاً ونرسم القيمة بأنفسنا.
private struct NumericField: View {
    let placeholder: String
    @Binding var text: String
    var keyboard: UIKeyboardType = .phonePad

    var body: some View {
        ZStack(alignment: .leading) {
            if text.isEmpty {
                Text(placeholder)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted.opacity(0.55))
            }
            Text(text)
                .font(.system(size: 15))
                .foregroundStyle(Theme.navy)
            TextField("", text: $text)
                .keyboardType(keyboard)
                .autocorrectionDisabled()
                .foregroundStyle(.clear)
                .tint(.clear)
        }
        .environment(\.layoutDirection, .leftToRight)
        .padding(12)
        .background(Theme.ivory)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

struct LoginView: View {
    @EnvironmentObject private var sb: SB
    @State private var mode: Mode = .otp
    @State private var email = ""
    @State private var password = ""
    // دخول برمز التحقق (طلب المستخدم 2026-08-22) — نفس دالة الويب
    @State private var phone = ""
    @State private var code = ""
    @State private var codeSent = false
    @State private var info: String?
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focused: Field?

    enum Mode { case otp, password }
    enum Field { case email, password, phone, code }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Theme.navy, Theme.navyDeep],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 0) {
                    Spacer().frame(height: 64)

                    // شعار السدو الرسمي — نفس هوية بقية المنصات
                    Image("EmblemGold")
                        .resizable()
                        .scaledToFit()
                        .frame(height: 110)

                    Text("شركة عبدالرحمن بن رضوان المشيقح")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(Theme.gold)
                        .padding(.top, 18)
                    Text("للمحاماة وإدارة إجراءات الإفلاس")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.gold.opacity(0.85))
                        .padding(.top, 2)

                    VStack(alignment: .leading, spacing: 14) {
                        Text("تسجيل الدخول")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(Theme.navy)

                        // تبويبا الطريقة
                        HStack(spacing: 0) {
                            modeTab("رمز التحقق", .otp)
                            modeTab("كلمة المرور", .password)
                        }
                        .background(Theme.ivory)
                        .clipShape(RoundedRectangle(cornerRadius: 10))

                        if mode == .otp {
                            otpFields
                        } else {
                            passwordFields
                        }

                        if let info {
                            Text(info)
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.success)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        if let error {
                            Text(error)
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.danger)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        submitButton
                    }
                    .padding(20)
                    .background(Theme.card)
                    .clipShape(RoundedRectangle(cornerRadius: 20))
                    .padding(.horizontal, 22)
                    .padding(.top, 28)
                }
            }
            .scrollBounceBehavior(.basedOnSize)
        }
    }

    private func modeTab(_ title: String, _ m: Mode) -> some View {
        Button {
            mode = m
            error = nil
            info = nil
        } label: {
            Text(title)
                .font(.system(size: 14, weight: mode == m ? .bold : .regular))
                .foregroundStyle(mode == m ? Theme.navy : Theme.muted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .background(mode == m ? Theme.gold : .clear)
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    // MARK: - حقول رمز التحقق

    private var otpFields: some View {
        otpFieldsBody
            // اكتمل الجوال (10 أرقام)؟ أرسل الرمز وانتقل — بلا زر
            .onChange(of: phone) { _, v in
                if !codeSent, !busy, v.filter(\.isNumber).count >= 10 { submit() }
            }
            // اكتمل الرمز (6 أرقام)؟ تحقّق فوراً
            .onChange(of: code) { _, v in
                if codeSent, !busy, v.filter(\.isNumber).count >= 6 { submit() }
            }
    }

    private var otpFieldsBody: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("رقم الجوال")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.muted)
                NumericField(placeholder: "05xxxxxxxx", text: $phone)
            }
            if codeSent {
                VStack(alignment: .leading, spacing: 6) {
                    Text("رمز التحقّق")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.muted)
                    NumericField(placeholder: "· · · · · ·", text: $code, keyboard: .numberPad)
                }
                Button("تغيير الرقم أو إعادة الإرسال") {
                    codeSent = false
                    code = ""
                    info = nil
                }
                .font(.system(size: 13))
                .foregroundStyle(Theme.goldDark)
            }
        }
    }

    // MARK: - حقول كلمة المرور

    private var passwordFields: some View {
        VStack(alignment: .leading, spacing: 14) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("البريد الإلكتروني")
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.muted)
                            TextField("name@example.com", text: $email)
                                .keyboardType(.emailAddress)
                                .textContentType(.username)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .environment(\.layoutDirection, .leftToRight)
                                .focused($focused, equals: .email)
                                .submitLabel(.next)
                                .onSubmit { focused = .password }
                                .padding(12)
                                .background(Theme.ivory)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("كلمة المرور")
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.muted)
                            SecureField("••••••••", text: $password)
                                .textContentType(.password)
                                .environment(\.layoutDirection, .leftToRight)
                                .focused($focused, equals: .password)
                                .submitLabel(.go)
                                .onSubmit { submit() }
                                .padding(12)
                                .background(Theme.ivory)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
        }
    }

    // MARK: - زر التنفيذ

    private var submitLabelText: String {
        if busy { return "لحظات…" }
        if mode == .password { return "دخول" }
        return codeSent ? "تحقّق ودخول" : "أرسل الرمز"
    }

    private var submitDisabled: Bool {
        if busy { return true }
        if mode == .password { return email.isEmpty || password.isEmpty }
        return codeSent ? code.trimmingCharacters(in: .whitespaces).count < 4
                        : phone.filter(\.isNumber).count < 9
    }

    private var submitButton: some View {
        Button(action: submit) {
            HStack {
                if busy { ProgressView().tint(Theme.navy) }
                Text(submitLabelText)
                    .font(.system(size: 16, weight: .bold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(Theme.gold)
            .foregroundStyle(Theme.navy)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .disabled(submitDisabled)
        .opacity(submitDisabled ? 0.6 : 1)
    }

    private func submit() {
        guard !busy else { return }
        busy = true
        error = nil
        info = nil
        Task {
            do {
                switch (mode, codeSent) {
                case (.password, _):
                    try await sb.login(
                        email: email.trimmingCharacters(in: .whitespaces),
                        password: password
                    )
                case (.otp, false):
                    try await sb.otpSend(
                        phone: latinDigits(phone.trimmingCharacters(in: .whitespaces)))
                    codeSent = true
                    info = "إن كان الرقم مسجّلاً لموظف، فسيصلك رمز عبر رسالة نصية." 
                case (.otp, true):
                    try await sb.otpVerify(
                        phone: latinDigits(phone.trimmingCharacters(in: .whitespaces)),
                        code: latinDigits(code.trimmingCharacters(in: .whitespaces))
                    )
                }
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}
