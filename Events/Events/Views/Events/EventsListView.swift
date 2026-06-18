//
//  EventsListView.swift
//  Events
//

import SwiftUI

struct EventsListView: View {
    @StateObject private var viewModel = EventsViewModel()
    @State private var showingCreateEvent = false

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.events.isEmpty {
                    LoadingView("Loading events...")
                } else if viewModel.events.isEmpty {
                    EmptyStateView(
                        icon: "calendar.badge.plus",
                        title: "No Events Yet",
                        message: "Create your first event to get started",
                        actionTitle: "Create Event",
                        action: { showingCreateEvent = true }
                    )
                } else {
                    List {
                        ForEach(viewModel.filteredEvents) { event in
                            NavigationLink(value: event) {
                                EventCardView(event: event)
                                    .listRowInsets(EdgeInsets())
                                    .listRowSeparator(.hidden)
                            }
                        }
                        .onDelete { indexSet in
                            indexSet.map { viewModel.filteredEvents[$0] }.forEach(viewModel.deleteEvent)
                        }
                    }
                    .listStyle(.plain)
                    .searchable(text: $viewModel.searchText, prompt: "Search events...")
                }
            }
            .navigationTitle("Events")
            .navigationDestination(for: Event.self) { event in
                EventDetailView(event: event)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingCreateEvent = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingCreateEvent) {
                CreateEventView()
            }
            .alert("Error", isPresented: .constant(viewModel.errorMessage != nil)) {
                Button("OK") { viewModel.errorMessage = nil }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
        .onAppear { viewModel.loadEvents() }
    }
}
