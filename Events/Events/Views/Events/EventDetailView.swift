//
//  EventDetailView.swift
//  Events
//

import SwiftUI

struct EventDetailView: View {
    let event: Event
    @StateObject private var viewModel = EventsViewModel()
    @State private var showingEditEvent = false
    @State private var showingDeleteAlert = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                AsyncImage(url: URL(string: event.imageURL ?? "")) { image in
                    image.resizable().aspectRatio(contentMode: .fill)
                } placeholder: {
                    Rectangle().fill(Color.gray.opacity(0.3))
                }
                .frame(height: 250)
                .clipped()
                .cornerRadius(16)

                VStack(alignment: .leading, spacing: 16) {
                    Text(event.title).font(.largeTitle).fontWeight(.bold)

                    Text(event.status.rawValue.capitalized)
                        .font(.caption)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(statusColor.opacity(0.2))
                        .foregroundColor(statusColor)
                        .cornerRadius(12)

                    DetailRow(icon: "calendar", title: "Date", value: event.date.formatted())
                    DetailRow(icon: "location", title: "Location", value: event.location)
                    DetailRow(icon: "person.2", title: "Attendees", value: "\(event.attendees.count)")

                    if !event.description.isEmpty {
                        Text("Description").font(.headline)
                        Text(event.description).foregroundColor(.secondary)
                    }
                }
                .padding(.horizontal, 20)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Edit Event") { showingEditEvent = true }
                    Button("Delete Event", role: .destructive) { showingDeleteAlert = true }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $showingEditEvent) {
            EditEventView(event: event)
        }
        .alert("Delete Event", isPresented: $showingDeleteAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                viewModel.deleteEvent(event)
                dismiss()
            }
        } message: {
            Text("Are you sure you want to delete this event?")
        }
    }

    private var statusColor: Color {
        switch event.status {
        case .upcoming: return .blue
        case .ongoing: return .green
        case .completed: return .gray
        case .cancelled: return .red
        }
    }
}

struct DetailRow: View {
    let icon: String
    let title: String
    let value: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon).foregroundColor(.blue).frame(width: 20)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.caption).foregroundColor(.secondary)
                Text(value).font(.subheadline).fontWeight(.medium)
            }
            Spacer()
        }
    }
}
