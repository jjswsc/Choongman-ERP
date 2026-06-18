//
//  Extensions.swift
//  Events
//

import Foundation
import SwiftUI

extension Date {
    func formatted(style: DateFormatter.Style = .medium) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = style
        formatter.timeStyle = .short
        return formatter.string(from: self)
    }

    var isToday: Bool {
        Calendar.current.isDateInToday(self)
    }

    var isTomorrow: Bool {
        Calendar.current.isDateInTomorrow(self)
    }
}

extension String {
    var isValidEmail: Bool {
        let pattern = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        return range(of: pattern, options: .regularExpression) != nil
    }

    var isValidPassword: Bool {
        count >= Constants.Validation.minPasswordLength
    }
}

extension View {
    func hideKeyboard() {
        #if canImport(UIKit)
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        #endif
    }
}

extension Color {
    static let primaryBlue = Color(red: 0.0, green: 0.48, blue: 1.0)
    static let secondaryGray = Color(red: 0.56, green: 0.56, blue: 0.58)
    static let backgroundGray = Color(red: 0.95, green: 0.95, blue: 0.97)
}
