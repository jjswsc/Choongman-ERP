//
//  EventsApp.swift
//  Events
//

import SwiftUI
import FirebaseCore

@main
struct EventsApp: App {
    init() {
        FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
