# Events iOS App

SwiftUI + Firebase 기반 이벤트 관리 iOS 앱 (MVVM).

## 폴더 구조

```
Events/
├── EventsApp.swift          # 앱 진입점 (Firebase 초기화)
├── ContentView.swift          # 인증 상태에 따른 루트 뷰
├── Models/
│   ├── Event.swift
│   └── User.swift
├── ViewModels/
│   ├── AuthViewModel.swift
│   └── EventsViewModel.swift
├── Services/
│   ├── FirebaseService.swift
│   ├── AuthService.swift
│   └── EventService.swift
├── Views/
│   ├── MainTabView.swift
│   ├── Authentication/
│   │   ├── LoginView.swift
│   │   └── SignUpView.swift
│   ├── Events/
│   │   ├── EventsListView.swift
│   │   ├── EventDetailView.swift
│   │   ├── CreateEventView.swift
│   │   └── EditEventView.swift
│   ├── Profile/
│   │   └── ProfileView.swift
│   └── Components/
│       ├── CustomButton.swift
│       ├── EventCardView.swift
│       ├── EmptyStateView.swift
│       └── LoadingView.swift
├── Utils/
│   ├── Constants.swift
│   └── Extensions.swift
└── Resources/
    └── GoogleService-Info.plist   # Firebase 설정 (placeholder)
```

## Xcode에 연결하기

1. Mac에서 `/Users/andrewd/Documents/Projects/Events/Events.xcodeproj` 열기
2. **File → Add Files to "Events"...** 로 위 `Events/` 소스 폴더 추가
3. **Copy items if needed** 체크 해제 (같은 위치에 두는 경우)
4. Target Membership: **Events** 체크

## Firebase 설정

1. [Firebase Console](https://console.firebase.google.com/)에서 iOS 앱 생성
2. `GoogleService-Info.plist` 다운로드 → `Events/Resources/`에 교체
3. Xcode: **File → Add Package Dependencies**
   - URL: `https://github.com/firebase/firebase-ios-sdk`
   - 선택: **FirebaseAuth**, **FirebaseFirestore**
4. Firebase Console에서 **Authentication (Email/Password)** · **Firestore** 활성화

### Firestore 보안 규칙 (예시)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /events/{eventId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null &&
        request.auth.uid == resource.data.createdBy;
    }
  }
}
```

## 빌드 및 실행

1. 시뮬레이터 또는 실기기 선택
2. **⌘R** 로 실행
3. Sign Up → 이벤트 생성/수정/삭제 테스트

## 아키텍처 (MVVM)

| 레이어 | 역할 |
|--------|------|
| **Model** | `Event`, `User` 데이터 구조 |
| **View** | SwiftUI 화면 |
| **ViewModel** | UI 상태·폼 검증·Service 호출 |
| **Service** | Firebase Auth / Firestore CRUD |

## 다음 단계 (선택)

- [ ] 이벤트 이미지 Firebase Storage 업로드
- [ ] 참석자 RSVP 기능
- [ ] Push 알림 (FCM)
- [ ] Unit / UI 테스트
