//
//  LoginView.swift
//  Events
//

import SwiftUI

struct LoginView: View {
    @StateObject private var viewModel = AuthViewModel()
    @State private var showingSignUp = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                VStack(spacing: 16) {
                    Image(systemName: "calendar.badge.plus")
                        .font(.system(size: 60))
                        .foregroundColor(.blue)
                    Text("Events").font(.largeTitle).fontWeight(.bold)
                    Text("Manage your events with ease")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                Spacer()

                VStack(spacing: 16) {
                    TextField("Email", text: $viewModel.email)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)

                    SecureField("Password", text: $viewModel.password)
                        .textFieldStyle(.roundedBorder)

                    CustomButton(
                        title: "Sign In",
                        action: { viewModel.signIn() },
                        isLoading: viewModel.isLoading,
                        isDisabled: !viewModel.isFormValid
                    )
                }
                .padding(.horizontal, 32)

                Button("Don't have an account? Sign Up") {
                    showingSignUp = true
                }
                .font(.subheadline)

                Spacer()
            }
            .sheet(isPresented: $showingSignUp) {
                SignUpView()
            }
            .alert("Error", isPresented: .constant(viewModel.errorMessage != nil)) {
                Button("OK") { viewModel.errorMessage = nil }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }
}
