//
//  EventsViewModel.swift
//  Events
//

import Foundation
import Combine

@MainActor
final class EventsViewModel: ObservableObject {
    @Published var events: [Event] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var searchText = ""

    private let eventService = EventService.shared
    private let authService = AuthService.shared
    private var cancellables = Set<AnyCancellable>()

    var filteredEvents: [Event] {
        guard !searchText.isEmpty else { return events }
        return events.filter {
            $0.title.localizedCaseInsensitiveContains(searchText) ||
            $0.location.localizedCaseInsensitiveContains(searchText) ||
            $0.description.localizedCaseInsensitiveContains(searchText)
        }
    }

    init() {
        eventService.$events
            .receive(on: DispatchQueue.main)
            .assign(to: &$events)

        eventService.$isLoading
            .receive(on: DispatchQueue.main)
            .assign(to: &$isLoading)

        eventService.$errorMessage
            .receive(on: DispatchQueue.main)
            .assign(to: &$errorMessage)
    }

    func loadEvents() {
        eventService.startListening()
    }

    func createEvent(title: String, description: String, date: Date, location: String, imageURL: String?) {
        guard let userId = authService.currentUser?.id else {
            errorMessage = "User not authenticated"
            return
        }
        let event = Event(
            title: title,
            description: description,
            date: date,
            location: location,
            imageURL: imageURL,
            createdBy: userId
        )
        Task {
            do {
                try await eventService.createEvent(event)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func updateEvent(_ event: Event) {
        Task {
            do {
                try await eventService.updateEvent(event)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func deleteEvent(_ event: Event) {
        Task {
            do {
                try await eventService.deleteEvent(event)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
