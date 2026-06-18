//
//  Event.swift
//  Events
//

import Foundation

struct Event: Identifiable, Codable, Hashable {
    let id: String
    var title: String
    var description: String
    var date: Date
    var location: String
    var imageURL: String?
    var attendees: [String]
    var status: EventStatus
    var createdBy: String
    var createdAt: Date

    init(
        id: String = UUID().uuidString,
        title: String,
        description: String,
        date: Date,
        location: String,
        imageURL: String? = nil,
        attendees: [String] = [],
        status: EventStatus = .upcoming,
        createdBy: String,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.description = description
        self.date = date
        self.location = location
        self.imageURL = imageURL
        self.attendees = attendees
        self.status = status
        self.createdBy = createdBy
        self.createdAt = createdAt
    }
}

enum EventStatus: String, CaseIterable, Codable {
    case upcoming
    case ongoing
    case completed
    case cancelled
}
