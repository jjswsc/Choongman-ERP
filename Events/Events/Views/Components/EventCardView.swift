//
//  EventCardView.swift
//  Events
//

import SwiftUI

struct EventCardView: View {
    let event: Event

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            AsyncImage(url: URL(string: event.imageURL ?? "")) { image in
                image.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                Rectangle().fill(Color.gray.opacity(0.3))
            }
            .frame(height: 200)
            .clipped()

            LinearGradient(
                colors: [.black.opacity(0.7), .black.opacity(0.2), .clear],
                startPoint: .bottom,
                endPoint: .top
            )

            VStack(alignment: .leading, spacing: 8) {
                Text(event.title)
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                    .lineLimit(2)

                HStack(spacing: 12) {
                    Label(event.date.formatted(date: .abbreviated, time: .omitted), systemImage: "calendar")
                    Label(event.location, systemImage: "location")
                }
                .font(.caption)
                .foregroundColor(.white)
                .lineLimit(1)

                HStack {
                    Label("\(event.attendees.count) attending", systemImage: "person.2")
                    Spacer()
                    Text(event.status.rawValue.capitalized)
                        .font(.caption2)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(statusColor.opacity(0.8))
                        .cornerRadius(8)
                }
                .font(.caption)
                .foregroundColor(.white)
            }
            .padding(16)
        }
        .cornerRadius(16)
        .shadow(radius: 4, y: 2)
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
