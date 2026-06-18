//
//  Constants.swift
//  Events
//

import Foundation

enum Constants {
    enum Firebase {
        static let eventsCollection = "events"
        static let usersCollection = "users"
    }

    enum UI {
        static let cornerRadius: CGFloat = 12
        static let padding: CGFloat = 16
        static let spacing: CGFloat = 8
    }

    enum Validation {
        static let minPasswordLength = 6
        static let maxTitleLength = 100
        static let maxDescriptionLength = 500
    }
}
