//
//  CreateEventView.swift
//  Events
//

import SwiftUI

struct CreateEventView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = EventsViewModel()

    @State private var title = ""
    @State private var description = ""
    @State private var date = Date()
    @State private var location = ""
    @State private var imageURL = ""

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
                Section("Image (Optional)") {
                    TextField("Image URL", text: $imageURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                }
            }
            .navigationTitle("Create Event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        viewModel.createEvent(
                            title: title,
                            description: description,
                            date: date,
                            location: location,
                            imageURL: imageURL.isEmpty ? nil : imageURL
                        )
                        if viewModel.errorMessage == nil { dismiss() }
                    }
                    .disabled(!isFormValid || viewModel.isLoading)
                }
            }
        }
    }
}
