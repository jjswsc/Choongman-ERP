//
//  SignUpView.swift
//  Events
//

import SwiftUI

struct SignUpView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = AuthViewModel()

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    TextField("Full Name", text: $viewModel.displayName)
                    TextField("Email", text: $viewModel.email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                    SecureField("Password", text: $viewModel.password)
                    SecureField("Confirm Password", text: $viewModel.confirmPassword)
                }

                Section {
                    CustomButton(
                        title: "Create Account",
                        action: {
                            viewModel.signUp()
                            if viewModel.isAuthenticated { dismiss() }
                        },
                        isLoading: viewModel.isLoading,
                        isDisabled: !viewModel.isSignUpFormValid
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
            }
            .navigationTitle("Sign Up")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .alert("Error", isPresented: .constant(viewModel.errorMessage != nil)) {
                Button("OK") { viewModel.errorMessage = nil }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }
}
