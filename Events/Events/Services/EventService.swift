//
//  EventService.swift
//  Events
//

import Foundation
import FirebaseFirestore

final class EventService: ObservableObject {
    static let shared = EventService()

    @Published var events: [Event] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let db = FirebaseService.shared.db
    private var listener: ListenerRegistration?

    private init() {}

    func startListening() {
        listener?.remove()
        isLoading = true

        listener = db.collection(Constants.Firebase.eventsCollection)
            .order(by: "date", descending: false)
            .addSnapshotListener { [weak self] snapshot, error in
                Task { @MainActor in
                    self?.isLoading = false
                    if let error {
                        self?.errorMessage = error.localizedDescription
                        return
                    }
                    guard let documents = snapshot?.documents else { return }
                    self?.events = documents.compactMap { doc in
                        let data = doc.data()
                        return Event(
                            id: doc.documentID,
                            title: data["title"] as? String ?? "",
                            description: data["description"] as? String ?? "",
                            date: (data["date"] as? Timestamp)?.dateValue() ?? Date(),
                            location: data["location"] as? String ?? "",
                            imageURL: data["imageURL"] as? String,
                            attendees: data["attendees"] as? [String] ?? [],
                            status: EventStatus(rawValue: data["status"] as? String ?? "upcoming") ?? .upcoming,
                            createdBy: data["createdBy"] as? String ?? "",
                            createdAt: (data["createdAt"] as? Timestamp)?.dateValue() ?? Date()
                        )
                    }
                }
            }
    }

    func stopListening() {
        listener?.remove()
        listener = nil
    }

    func createEvent(_ event: Event) async throws {
        try await db.collection(Constants.Firebase.eventsCollection).document(event.id).setData([
            "title": event.title,
            "description": event.description,
            "date": Timestamp(date: event.date),
            "location": event.location,
            "imageURL": event.imageURL as Any,
            "attendees": event.attendees,
            "status": event.status.rawValue,
            "createdBy": event.createdBy,
            "createdAt": Timestamp(date: event.createdAt)
        ])
    }

    func updateEvent(_ event: Event) async throws {
        try await db.collection(Constants.Firebase.eventsCollection).document(event.id).updateData([
            "title": event.title,
            "description": event.description,
            "date": Timestamp(date: event.date),
            "location": event.location,
            "imageURL": event.imageURL as Any,
            "attendees": event.attendees,
            "status": event.status.rawValue
        ])
    }

    func deleteEvent(_ event: Event) async throws {
        try await db.collection(Constants.Firebase.eventsCollection).document(event.id).delete()
    }
}
