//
//  AuthViewModel.swift
//  Events
//

import Foundation

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var email = ""
    @Published var password = ""
    @Published var confirmPassword = ""
    @Published var displayName = ""
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var isAuthenticated = false

    private let authService = AuthService.shared

    var currentUser: User? { authService.currentUser }

    var isFormValid: Bool {
        !email.isEmpty && !password.isEmpty && email.isValidEmail && password.isValidPassword
    }

    var isSignUpFormValid: Bool {
        isFormValid && !displayName.isEmpty && password == confirmPassword
    }

    func signIn() {
        guard isFormValid else {
            errorMessage = "Please enter valid email and password"
            return
        }
        isLoading = true
        errorMessage = nil
        Task {
            do {
                try await authService.signIn(email: email, password: password)
                isAuthenticated = true
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }

    func signUp() {
        guard isSignUpFormValid else {
            errorMessage = "Please fill all fields correctly"
            return
        }
        isLoading = true
        errorMessage = nil
        Task {
            do {
                try await authService.signUp(email: email, password: password, displayName: displayName)
                isAuthenticated = true
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }

    func signOut() {
        do {
            try authService.signOut()
            isAuthenticated = false
            clearForm()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func checkAuthState() {
        isAuthenticated = authService.isAuthenticated
    }

    private func clearForm() {
        email = ""
        password = ""
        confirmPassword = ""
        displayName = ""
    }
}
