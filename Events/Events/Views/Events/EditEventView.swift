//
//  EditEventView.swift
//  Events
//

import SwiftUI

struct EditEventView: View {
    let event: Event
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = EventsViewModel()

    @State private var title: String
    @State private var description: String
    @State private var date: Date
    @State private var location: String
    @State private var imageURL: String
    @State private var status: EventStatus

    init(event: Event) {
        self.event = event
        _title = State(initialValue: event.title)
        _description = State(initialValue: event.description)
        _date = State(initialValue: event.date)
        _location = State(initialValue: event.location)
        _imageURL = State(initialValue: event.imageURL ?? "")
        _status = State(initialValue: event.status)
    }

    private var isFormValid: Bool {
        !title.isEmpty && !location.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Event Details") {
                    TextField("Event Title", text: $title)
                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(3...6)
                }
                Section("Date & Time") {
                    DatePicker("Event Date", selection: $date)
                }
                Section("Location") {
                    TextField("Event Location", text: $location)
                }
                Section("Status") {
                    Picker("Status", selection: $status) {
                        ForEach(EventStatus.allCases, id: \.self) { s in
                            Text(s.rawValue.capitalized).tag(s)
                        }
                    }
                }
                Section("Image (Optional)") {
                    TextField("Image URL", text: $imageURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                }
            }
            .navigationTitle("Edit Event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let updated = Event(
                            id: event.id,
                            title: title,
                            description: description,
                            date: date,
                            location: location,
                            imageURL: imageURL.isEmpty ? nil : imageURL,
                            attendees: event.attendees,
                            status: status,
                            createdBy: event.createdBy,
                            createdAt: event.createdAt
                        )
                        viewModel.updateEvent(updated)
                        if viewModel.errorMessage == nil { dismiss() }
                    }
                    .disabled(!isFormValid || viewModel.isLoading)
                }
            }
        }
    }
}
