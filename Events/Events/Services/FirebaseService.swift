//
//  FirebaseService.swift
//  Events
//

import Foundation
import FirebaseFirestore

final class FirebaseService {
    static let shared = FirebaseService()

    let db = Firestore.firestore()

    private init() {}

    func collection(_ name: String) -> CollectionReference {
        db.collection(name)
    }
}
