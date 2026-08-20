import SwiftUI

// شاشة الدخول — نفس هوية شاشة الويب: كحلي عميق وميزان ذهبي واسم الشركة كاملاً.
// ⚠️ قاعدة ثابتة من المستخدم: اسم الشركة لا يُختصر في أي موضع.

struct LoginView: View {
    @EnvironmentObject private var sb: SB
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focused: Field?

    enum Field { case email, password }

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

                        if let error {
                            Text(error)
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.danger)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        Button(action: submit) {
                            HStack {
                                if busy { ProgressView().tint(Theme.navy) }
                                Text(busy ? "جارٍ الدخول…" : "دخول")
                                    .font(.system(size: 16, weight: .bold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 13)
                            .background(Theme.gold)
                            .foregroundStyle(Theme.navy)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .disabled(busy || email.isEmpty || password.isEmpty)
                        .opacity(busy || email.isEmpty || password.isEmpty ? 0.6 : 1)
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

    private func submit() {
        guard !busy, !email.isEmpty, !password.isEmpty else { return }
        busy = true
        error = nil
        Task {
            do {
                try await sb.login(
                    email: email.trimmingCharacters(in: .whitespaces),
                    password: password
                )
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}
