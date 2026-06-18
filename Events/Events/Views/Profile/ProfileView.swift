//
//  ProfileView.swift
//  Events
//

import SwiftUI

struct ProfileView: View {
    @StateObject private var authViewModel = AuthViewModel()
    @State private var showingSignOutAlert = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                VStack(spacing: 16) {
                    Circle()
                        .fill(Color.blue.opacity(0.3))
                        .frame(width: 100, height: 100)
                        .overlay {
                            Text(authViewModel.currentUser?.displayName.prefix(1).uppercased() ?? "U")
                                .font(.title)
                                .fontWeight(.semibold)
                                .foregroundColor(.blue)
                        }

                    Text(authViewModel.currentUser?.displayName ?? "User")
                        .font(.title2)
                        .fontWeight(.semibold)

                    Text(authViewModel.currentUser?.email ?? "")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.top, 40)

                Spacer()

                CustomButton(
                    title: "Sign Out",
                    action: { showingSignOutAlert = true },
                    style: .destructive
                )
                .padding(.horizontal, 32)
                .padding(.bottom, 40)
            }
            .navigationTitle("Profile")
            .alert("Sign Out", isPresented: $showingSignOutAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Sign Out", role: .destructive) {
                    authViewModel.signOut()
                }
            } message: {
                Text("Are you sure you want to sign out?")
            }
        }
    }
}
