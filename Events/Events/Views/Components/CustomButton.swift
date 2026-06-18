//
//  CustomButton.swift
//  Events
//

import SwiftUI

struct CustomButton: View {
    let title: String
    let action: () -> Void
    var style: ButtonStyle = .primary
    var isLoading = false
    var isDisabled = false

    enum ButtonStyle {
        case primary, secondary, outline, destructive
    }

    var body: some View {
        Button(action: action) {
            HStack {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: textColor))
                        .scaleEffect(0.8)
                } else {
                    Text(title).fontWeight(.semibold)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(backgroundColor)
            .foregroundColor(textColor)
            .cornerRadius(Constants.UI.cornerRadius)
            .overlay(
                RoundedRectangle(cornerRadius: Constants.UI.cornerRadius)
                    .stroke(borderColor, lineWidth: style == .outline ? 1 : 0)
            )
        }
        .disabled(isDisabled || isLoading)
        .opacity(isDisabled ? 0.6 : 1)
    }

    private var backgroundColor: Color {
        switch style {
        case .primary: return .blue
        case .secondary: return .gray.opacity(0.2)
        case .outline: return .clear
        case .destructive: return .red
        }
    }

    private var textColor: Color {
        switch style {
        case .primary, .destructive: return .white
        case .secondary, .outline: return .primary
        }
    }

    private var borderColor: Color {
        style == .outline ? .blue : .clear
    }
}
