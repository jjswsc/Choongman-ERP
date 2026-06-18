//
//  User.swift
//  Events
//

import Foundation

struct User: Identifiable, Codable, Hashable {
    let id: String
    var email: String
    var displayName: String
    var profileImageURL: String?
    var createdAt: Date

    init(
        id: String,
        email: String,
        displayName: String,
        profileImageURL: String? = nil,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.email = email
        self.displayName = displayName
        self.profileImageURL = profileImageURL
        self.createdAt = createdAt
    }
}
