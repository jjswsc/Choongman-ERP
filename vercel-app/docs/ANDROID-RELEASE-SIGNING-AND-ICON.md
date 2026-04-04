# Android 릴리즈 서명/아이콘/빌드 변형 가이드

## 1) 서명키 설정
1. 자동 생성(권장): `npm run mobile:android:signing:init`
2. 스크립트 입력값
   - `keystore password`
   - `key password`
3. 생성 결과
   - `vercel-app/keystore/choongman-pos-release.jks`
   - `vercel-app/android/keystore.properties`

수동 설정이 필요하면 `vercel-app/android/keystore.properties.example`를 참고해 직접 작성할 수 있습니다.

`keystore.properties`는 `.gitignore`에 포함되어 커밋되지 않습니다.

## 2) 빌드 변형(Variants)
- `prodRelease`: 운영 배포용 (`applicationId`: `com.choongman.erp.pos`)
- `pilotRelease`: 파일럿 배포용 (`applicationIdSuffix`: `.pilot`)
- `debug` 빌드는 `applicationIdSuffix: .debug`가 붙습니다.

## 3) 빌드 명령
- 운영 APK: `npm run mobile:android:assemble:prod`
- 파일럿 APK: `npm run mobile:android:assemble:pilot`
- 운영 AAB: `npm run mobile:android:bundle:prod`
- 파일럿 AAB: `npm run mobile:android:bundle:pilot`

산출물 경로 예시:
- `android/app/build/outputs/apk/prod/release/`
- `android/app/build/outputs/apk/pilot/release/`
- `android/app/build/outputs/bundle/prodRelease/`

## 4) 앱 아이콘 교체
Android Studio에서 아래 절차를 권장합니다.
1. `android/` 프로젝트를 Android Studio로 오픈
2. `app` 우클릭 -> `New` -> `Image Asset`
3. Foreground/Background 아이콘 이미지 지정
4. `ic_launcher`, `ic_launcher_round` 리소스 생성 후 저장

현재 매니페스트는 `@mipmap/ic_launcher`와 `@mipmap/ic_launcher_round`를 사용합니다.
