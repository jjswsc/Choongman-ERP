//
//  MainTabView.swift
//  Events
//

import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            EventsListView()
                .tabItem {
                    Label("Events", systemImage: "calendar")
                }

            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person")
                }
        }
    }
}
