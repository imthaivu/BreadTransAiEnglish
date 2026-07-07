# Tổng quan dự án BreadTrans

**BreadTrans** (tên package npm: `daily-speaking-english`) là ứng dụng web học tiếng Anh cho học sinh Việt Nam: flashcard, ngữ pháp (video), luyện nói có nộp bài và chấm/feedback, lớp học với quiz, stories, bảng xếp hạng và “bánh mì” (tiền tệ gamification). Giao diện và nội dung chủ yếu tiếng Việt.

---
docker-compose up dev
docker-compose run --rm build-test
docker-compose up prod
## Công nghệ

| Lớp | Công nghệ |
|-----|-----------|
| Framework | **Next.js 16** (App Router), **React 19**, **TypeScript** |
| Styling | **Tailwind CSS 4** |
| Backend dữ liệu | **Firebase**: Auth, Firestore, Storage |
| Server | **firebase-admin** cho API routes và đồng bộ claims |
| State / data | **TanStack React Query**, **Zustand** (nơi dùng) |
| Form / validation | **react-hook-form**, **Zod** |
| UI / motion | **Headless UI**, **Framer Motion**, **Swiper**, **Recharts**, **Lucide / React Icons** |
| AI (chấm nói) | **Google Generative AI** (Gemini, model `gemini-2.5-flash`) |

Dev: `npm run dev` (Turbopack). Build: `npm run build` / `npm start`.

---

## Cấu trúc thư mục chính

```
src/
  app/
    layout.tsx            # Shell: font, providers, Header/Footer, Toaster
    (routes)/             # Trang công khai: layout + FeatureRoutesChrome (trừ "/")
      page.tsx            # Trang chủ
      flashcard/page.tsx  # Chỉ re-export screen từ modules (route mỏng)
      …                   # grammar, classes, profile, …
    (admin)/admin/        # /admin/*
    api/                  # Route Handlers
  components/             # UI dùng chung (layout, ui, profile, providers, …)
  constants/
  lib/                    # auth, firebase, helpers không thuộc một feature
  modules/<feature>/      # Theo domain
    components/, hooks/, services hoặc api/, screens/, types.ts
  styles/
  types/
public/data/
scripts/
```

**Quy ước:** `app/(routes)/*/page.tsx` giữ **mỏng** (import screen từ `modules/.../screens`). Logic/UI theo feature nằm trong `modules/<feature>/`. `modules/classes/api/` gom các module Firestore tách nhỏ (quiz, presence, admiration, …). `components/layout/FeatureRoutesChrome.tsx` thay cho nhóm route `(features)` cũ.

Alias: `@/` → `src/`.

---

## Vai trò người dùng

Định nghĩa trong `UserRole` (`src/lib/auth/types.ts`):

- **student**: nộp bài nói, flashcard, tham gia lớp, profile, streak, “bánh mì”.
- **teacher**: xem/quản lý lớp, feedback học sinh (theo luồng classes).
- **admin**: `/admin` — users, teachers, students, classes, currency, dashboard.

**Custom claims** trên ID token (`admin`, `teacher`) được dùng để bảo vệ API và phân quyền; đồng bộ từ trường `role` trong Firestore bằng script `npm run sync-auth-claims` (xem mục Scripts).

**Phụ huynh** không phải role riêng trong code: thông tin `parentName` / `parentPhone` gắn với hồ sơ học sinh (liên hệ từ giáo viên trong danh sách lớp).

---

## Luồng xác thực

1. Client: **Firebase Auth** (`lib/firebase/client.ts`) — đăng nhập, `onAuthStateChanged`, đọc/ghi Firestore/Storage.
2. Profile ứng dụng: `AuthProvider` (`lib/auth/context.tsx`) — đồng bộ doc `users/{uid}`, streak, modal streak, v.v.
3. API bảo vệ: header `Authorization: Bearer <idToken>`, verify bằng **firebase-admin** (`lib/auth/server-auth.ts`): `getServerSession`, `checkAdminAccess`, `checkTeacherOrAdminAccess`.

Các route auth quan trọng:

- `POST /api/auth/login`, `register`, `verify-password`, `change-password`, `update-login-session`, `sync-custom-claims`

---

## Trang và route UI

| Đường dẫn | Mô tả ngắn |
|-----------|------------|
| `/` | Trang chủ: tab học (flashcard, nộp bài nói), FAQ, timeline, SEO schema |
| `/grammar` | Ngữ pháp — video YouTube theo chủ đề |
| `/flashcard` | Học từ / quiz / list — dữ liệu từ `public/data` + tiến độ Firestore |
| `/speaking-upload` | Ghi âm / upload, script theo sách–bài, gọi API chấm Gemini |
| `/classes`, `/classes/[classId]` | Lớp: thành viên, tiến độ, quiz stories, admiration, presence |
| `/classes/student`, `/classes/teacher` | View theo vai trò |
| `/profile` | Hồ sơ người dùng |
| `/stories`, `/privacy`, `/terms` | Nội dung tĩnh / pháp lý |
| `/admin`, `/admin/users`, … | Dashboard admin (layout riêng, `RequireRole` admin) |

Điều hướng theo role: `src/constants/header-nav.constant.tsx` (`NavigationList`).

---

## API Routes (`src/app/api`)

| Method / path | Mục đích |
|---------------|----------|
| `GET /api/images/pexels` | Proxy ảnh từ Pexels (tránh CORS) |
| `POST /api/speaking/evaluate` | Gửi audio + script → Gemini → text feedback điểm (cần `GEMINI_API_KEY`) |
| Auth (xem trên) | Đăng ký, đăng nhập, mật khẩu, session, sync claims |
| `POST /api/auth/sync-custom-claims` | Đồng bộ claims từ server |
| `POST /api/admin/users/create` | Tạo user (admin) |
| `PATCH/DELETE …/admin/users/[userId]` | Sửa/xóa user |
| `POST …/unlock`, `reset-password` | Mở khóa / reset mật khẩu |
| `POST /api/admin/flashcard/sync-all-collections` | Đồng bộ dữ liệu flashcard/tiến độ (batch admin) |
| `POST /api/admin/flashcard/sync-book-progress` | Đồng bộ tiến độ sách |
| `POST /api/admin/storage/cleanup-speaking-submissions` | Dọn file speaking trên Storage |
| `POST /api/admin/classes/migrate-students`, `migrate-users-data` | Migration lớp/người dùng |

Chi tiết quyền: từng file route kiểm tra Bearer token và claim admin/teacher khi cần.

---

## Firestore — collection thường gặp

| Collection | Vai trò |
|------------|---------|
| `users` | Hồ sơ: `role`, `classIds`, streak, rank, admiration, session/login, v.v. |
| `classes` | Lớp: giáo viên, học sinh, stories (quiz/social), presence, cấu hình |
| `userBookProgress` | Tiến độ sách/bài: quiz, bài nói (`lessons`, `completedLessonsSpeaking`, URL file, …) |
| `currency` | Giao dịch “bánh mì” / Shopee / cộng trừ theo lớp |

**Lưu ý:** Danh sách từ cần ôn (review words) trong code hiện tại chủ yếu dùng **localStorage** (`reviewWords_{userId}`) trong `flashcard/services.ts`; file `DATABASE_REORGANIZATION_PROPOSAL.md` trong module flashcard là đề xuất kiến trúc, không nhất thiết đã triển khai hết.

---

## Firebase Storage

Ví dụ path bài nói (trong `speaking-upload/services.ts`):

`speaking_submissions/{dd-mm-yyyy}/book-{bookId}/lesson-{lessonId}/student-{studentId}.{ext}`

`next.config.ts` cấu hình `images.remotePatterns` cho bucket Firebase Storage của project.

---

## Dữ liệu tĩnh (`public/data`)

- `books/`, `flashcard/` — JSON sách và bài học phục vụ flashcard/quiz.
- `scripts/book_*.json` — văn bản đọc cho bài nói.
- Script Node `npm run data` chạy `public/data/splitBooksStructured.js` (tách/ghép dữ liệu sách — xem file để biết input/output).

---

## Biến môi trường (tên gợi ý, không chứa secret)

**Client (NEXT_PUBLIC):**

- `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`
- `NEXT_PUBLIC_FIREBASE_DATABASE_URL` — Realtime Database URL cho multiplayer games (tuỳ chọn). Dev: `https://handbook-65d51-default-rtdb.asia-southeast1.firebasedatabase.app/` · Product: `https://breadtrans-f6134-default-rtdb.asia-southeast1.firebasedatabase.app/`
- `NEXT_PUBLIC_SITE_URL` — canonical / OG (mặc định trong code trỏ domain deploy)

**Server (Firebase Admin):**

- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (xuống dòng trong private key thường escape `\n`)

**Khác:**

- `GEMINI_API_KEY` — chấm speaking

README gốc nhắc `.env.local.example`; nếu file không có trong repo, hãy tự tạo `.env.local` theo các tên trên.

---

## Scripts npm

| Script | Ý nghĩa |
|--------|---------|
| `dev` | Next dev + Turbopack |
| `build` / `start` | Production |
| `lint` | ESLint |
| `data` | Tiền xử lý dữ liệu sách (Node script trong `public/data`) |
| `sync-auth-claims` | Ghi custom claims Auth theo `users.role` (cần env admin) |
| `sync-auth-claims:dry` | Chạy thử, không ghi Auth |

---

## Providers toàn cục (`app/layout.tsx`)

- `AuthProvider`
- `ReactQueryProvider`
- `AppDataProvider`
- `PresenceProvider`
- `react-hot-toast` — thông báo

---

## SEO & metadata

- `SITE_CONFIG` (`constants/site.config.ts`) — base URL, helper `getUrl` / `getAssetUrl`.
- `sitemap.ts`, `robots.ts` trong `app/`.
- Trang chủ inject JSON-LD (EducationalOrganization) trong `useEffect`.

---

## Điểm cần lưu ý khi bảo trì

1. **Đồng bộ role:** Sau khi đổi `role` trong Firestore, cần cập nhật custom claims (client gọi sync hoặc chạy script) để token phản ánh đúng quyền.
2. **Admin API:** Luôn kiểm tra cả token và claim, không chỉ dựa vào UI.
3. **Pexels:** Key đang nằm trong source của route proxy; nên chuyển sang biến môi trường và rotate key nếu repo public.
4. **Tên package vs thương hiệu:** `package.json` vẫn là `daily-speaking-english`; branding người dùng là BreadTrans.

---

*Tài liệu này mô tả trạng thái codebase tại thời điểm tạo file; khi refactor collection hoặc route, nên cập nhật tương ứng.*

---

Dưới đây là bản đồ folder / nhóm file trong src/ và việc mỗi phần đảm nhiệm, theo đúng cấu trúc hiện tại của BreadTrans.

src/app/ — Next.js App Router (URL + API)
Nhóm	Việc dùng để làm gì
layout.tsx, loading.tsx, not-found.tsx	Khung toàn app: font, provider, Header/Footer, toast, skeleton loading, trang 404.
(routes)/	Trang người dùng: /, /grammar, /classes, /profile, … Nhóm (routes) không đổi URL, chỉ gom layout. layout.tsx + FeatureRoutesChrome: khung trắng/padding, LearnTabs trên /flashcard & /speaking-upload; trang chỉ / không bọc chrome đó.
(routes)/*/page.tsx	Route mỏng: map URL → import màn hình từ modules/.../screens hoặc page nhỏ trực tiếp.
(admin)/admin/	Trang quản trị /admin/* (users, classes, currency, …).
api/**/route.ts	API server: auth (login, register, đổi pass, sync claims), admin (user, flashcard sync, storage cleanup, migrate), speaking/evaluate (Gemini), proxy ảnh Pexels.
sitemap.ts, robots.ts	SEO: sitemap, robots.txt.
src/components/ — UI & tính năng dùng chung (không gắn một “nghiệp vụ” duy nhất)
Folder	Việc dùng để làm gì
layout/	Header, Footer, sidebar app (AppNav), MainContent, LearnTabs, ContactPopup, FeatureRoutesChrome (shell route không phải home).
ui/	Primitive: Button, Modal, Card, Input, pagination, avatar, animation (PageMotion), crop ảnh, spinner, confirm dialog, v.v.
auth/	Modal đăng nhập SĐT / flow auth UI.
profile/	Khối hồ sơ (avatar, đổi pass, reward…) dùng trên /profile.
providers/	React Query, context dữ liệu app.
presence/	Cập nhật “online” lớp (Firestore + interval).
notifications/	Toast/particle admiration, manager thông báo.
streamline/	AudioPlayer — nghe file, gọi modules/listening/services để lưu tiến độ nghe.
feedback/	Hiệu ứng reaction (ví dụ stories).
src/constants/ — Hằng số & cấu hình tĩnh
Site URL (site.config), menu header, grammar topics, layout sidebar, v.v. — không chứa logic nặng, chủ yếu dữ liệu / token layout.

src/hooks/ — Hook dùng chung toàn app
Ví dụ useScrollToTop (đổi route thì scroll lên đầu), usePageTransition (class CSS khi chuyển trang). Không gắn riêng một feature như flashcard/classes.

src/lib/ — Hạ tầng “nền”
Folder / file	Việc dùng để làm gì
firebase/	Init client Firebase (Auth, Firestore, Storage) và admin (service account) cho API.
auth/	AuthProvider, guard role, verify token server (server-auth), sync custom claims phía client.
Các file khác (vd. audio/, rate-limit)	Helper dùng nhiều nơi, tách khỏi UI.
src/modules/<tên-feature>/ — Nghiệp vụ theo domain (pattern phổ biến)
Mỗi module thường có vài “lớp”:

screens/ — Màn hình lớn (client), được app/.../page.tsx import.
components/ — Widget chỉ feature đó dùng.
hooks.ts — React Query / state gắn feature.
services.ts hoặc api/ — Gọi Firestore / Storage / fetch JSON.
types.ts, constants.ts — Kiểu & hằng riêng feature.
Cụ thể từng module:

Module	Việc chính
admin/	CRUD user/lớp/giáo viên/học sinh, tiền tệ, dashboard số liệu, modal/form/table dùng chung admin.
classes/	Lớp học: danh sách, chi tiết lớp, thành viên, quiz/stories, admiration, biểu đồ tiến độ, services.ts (core) + api/ (quiz, presence, admiration, quiz-story, member-avatar).
flashcard/	Sách/bài, flashcard/quiz/list, tiến độ userBookProgress, từ ôn (localStorage), screens/FlashcardScreen.
grammar/	Chủ đề ngữ pháp, modal/video (YouTube / HTML5).
home/	Trang chủ: FAQ, timeline, MagicDoor (CTA), các section marketing/giới thiệu.
speaking-upload/	Chọn sách–bài, ghi âm, upload Storage, gọi API chấm, screens/SpeakingUploadScreen.
listening/	saveListeningProgress — lưu số lần nghe (dùng từ AudioPlayer).
user/	Hook/profile phụ trợ (streak, public profile…) dùng chung auth & lớp.
src/styles/ — CSS toàn cục
globals.css, chỉnh Swiper, v.v. — theme / reset / utility không gắn một component file.

src/types/ — TypeScript dùng chéo module
Interface Firestore user, class, pagination response, mở rộng type Firebase Auth claims, v.v.

src/utils/ — Hàm thuần (không React)
Ví dụ cn() (gộp className), audio.ts — tiện ích ngắn, import từ nhiều nơi.

Ngoài src/ (ngắn gọn)
public/	Ảnh, âm thanh, public/data/ (JSON sách, flashcard, script đọc) — tải qua URL tĩnh.
scripts/	Node one-off (vd. sync custom claims từ Firestore → Firebase Auth).
Tóm một dòng:

app/ = định tuyến + API.
components/ + hooks/ + lib/ + constants/ = dùng chung.
modules/ = từng mảng sản phẩm (admin, lớp, flashcard, nói, ngữ pháp, home, user, listening).
Nếu bạn muốn, có thể bổ sung sơ đồ luồng dữ liệu (Firebase ↔ module nào) hoặc bảng “file nào thuộc route nào” theo từng URL.#   B r e a d T r a n s A i E n g l i s h  
 