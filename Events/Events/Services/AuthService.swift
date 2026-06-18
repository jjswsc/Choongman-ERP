//
//  AuthService.swift
//  Events
//

import Foundation
import FirebaseAuth
import FirebaseFirestore

final class AuthService: ObservableObject {
    static let shared = AuthService()

    @Published var currentUser: User?
    @Published var isAuthenticated = false

    private let auth = Auth.auth()
    private let db = FirebaseService.shared.db

    private init() {
        auth.addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                if let user {
                    await self?.fetchUserData(uid: user.uid)
                } else {
                    self?.currentUser = nil
                    self?.isAuthenticated = false
                }
            }
        }
    }

    func signIn(email: String, password: String) async throws {
        let result = try await auth.signIn(withEmail: email, password: password)
        await fetchUserData(uid: result.user.uid)
    }

    func signUp(email: String, password: String, displayName: String) async throws {
        let result = try await auth.createUser(withEmail: email, password: password)
        let user = User(id: result.user.uid, email: email, displayName: displayName)
        try await saveUserData(user)
        await MainActor.run {
            currentUser = user
            isAuthenticated = true
        }
    }

    func signOut() throws {
        try auth.signOut()
        currentUser = nil
        isAuthenticated = false
    }

    @MainActor
    private func fetchUserData(uid: String) async {
        do {
            let document = try await db.collection(Constants.Firebase.usersCollection).document(uid).getDocument()
            if let data = document.data() {
                currentUser = User(
                    id: uid,
                    email: data["email"] as? String ?? "",
                    displayName: data["displayName"] as? String ?? "",
                    profileImageURL: data["profileImageURL"] as? String,
                    createdAt: (data["createdAt"] as? Timestamp)?.dateValue() ?? Date()
                )
                isAuthenticated = true
            }
        } catch {
            print("Error fetching user data: \(error)")
        }
    }

    private func saveUserData(_ user: User) async throws {
        try await db.collection(Constants.Firebase.usersCollection).document(user.id).setData([
            "email": user.email,
            "displayName": user.displayName,
            "profileImageURL": user.profileImageURL as Any,
            "createdAt": Timestamp(date: user.createdAt)
        ])
    }
}
