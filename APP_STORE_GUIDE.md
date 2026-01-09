# 🎯 Quik Darts - App Store Submission Guide

Complete step-by-step guide to get your iOS app on the App Store.

## ✅ Prerequisites

### 1. Hardware & Software
- **Mac computer** with macOS Ventura or later
- **Xcode 15+** (Download from Mac App Store - FREE)
- **iPhone** for testing (iOS 16+)

### 2. Apple Developer Account
- **Cost:** $99/year
- **Sign up:** https://developer.apple.com/programs/enroll/
- **Required for:** App Store submission, TestFlight, push notifications

---

## 📱 Step 1: Open Project in Xcode

1. **Clone your repository** (if not already):
   ```bash
   git clone https://github.com/wheniwasjusthustlinbroke/quik-darts.git
   cd quik-darts
   ```

2. **Open the project:**
   - Double-click `QuikDarts-iOS/QuikDarts-iOS.xcodeproj`
   - OR: Open Xcode → File → Open → Select `QuikDarts-iOS.xcodeproj`

3. **First build** (may take a few minutes):
   - Select **iPhone Simulator** from top bar
   - Press **⌘+B** (Command+B) to build
   - Fix any errors (there shouldn't be any!)

---

## 🔐 Step 2: Configure Signing & Capabilities

1. **Select the project** in Xcode's left sidebar (blue icon)
2. **Select target "QuikDarts-iOS"**
3. **Go to "Signing & Capabilities" tab**
4. **Change these settings:**
   - ✅ **Automatically manage signing** (check this box)
   - **Team:** Select your Apple Developer account
   - **Bundle Identifier:** Change from `com.yourcompany.quikdarts` to something unique:
     ```
     com.YOURNAME.quikdarts
     ```
     Example: `com.johnsmith.quikdarts`

---

## 🎨 Step 3: Add App Icon

You need app icons in these sizes:
- **1024×1024** (App Store)
- **180×180** (iPhone @3x)
- **120×120** (iPhone @2x)
- **60×60** (iPhone @1x)

### Option A: Use Online Generator (Easiest)
1. Create a **1024×1024 PNG** with your dartboard logo
2. Use **https://appicon.co** or **https://makeappicon.com**
3. Upload your 1024×1024 image
4. Download the generated icons
5. Drag them into Xcode's **Assets.xcassets/AppIcon** slots

### Option B: Manual Creation
1. Create icons in each size using Photoshop/Figma
2. Drag into **Assets.xcassets → AppIcon** in Xcode

---

## 📲 Step 4: Test on Real iPhone

1. **Connect your iPhone** via USB
2. **Trust the device:**
   - iPhone → Settings → General → VPN & Device Management
   - Trust your developer certificate
3. **Select your iPhone** from Xcode's device menu (top bar)
4. **Press ⌘+R** (Command+R) to build and run
5. **Test gameplay:**
   - ✅ Dartboard renders correctly
   - ✅ Touch/throw mechanics work
   - ✅ Power charging feels responsive
   - ✅ Scoring is accurate
   - ✅ Haptic feedback works

---

## 🏪 Step 5: Create App in App Store Connect

1. **Go to:** https://appstoreconnect.apple.com
2. **Click "My Apps"** → **"+"** → **"New App"**
3. **Fill in details:**
   - **Platform:** iOS
   - **Name:** Quik Darts
   - **Primary Language:** English (US)
   - **Bundle ID:** (Select the one you created in Xcode)
   - **SKU:** `quikdarts-001` (any unique ID)
   - **User Access:** Full Access

---

## 📝 Step 6: Prepare App Store Listing

Before submission, prepare these materials:

### Required Screenshots (iPhone)
- **6.7" Display** (iPhone 15 Pro Max): 1290×2796
- **6.5" Display** (iPhone 14 Plus): 1242×2688
- **5.5" Display** (iPhone 8 Plus): 1242×2208

Take screenshots of:
1. Main menu
2. Game in progress (dartboard with darts)
3. Winner screen
4. Player customization
5. Practice mode (if available)

### App Information
- **Description** (4000 characters max):
  ```
  🎯 Quik Darts - The Ultimate Dart Game Experience

  Play authentic 501, 301, and 701 darts on your iPhone with ultra-responsive controls,
  stunning graphics, and realistic gameplay. Challenge friends online or practice your
  skills in solo mode.

  FEATURES:
  • Realistic dartboard with accurate scoring
  • Power-charging throw mechanic for precision
  • Online multiplayer - Challenge players worldwide
  • Practice modes: 180s, Bulls, Random targets
  • Achievements and statistics tracking
  • Haptic feedback for immersive gameplay
  • Optimized for ProMotion (120fps)
  • Works on all iPhones and iPads

  GAME MODES:
  • 501, 301, 701 regulation games
  • Best-of-5 legs match format
  • Checkout suggestions for strategic play
  • Bust detection with proper doubling rules

  ONLINE MULTIPLAYER:
  • Real-time matchmaking
  • Play against friends or random opponents
  • Live game synchronization

  Perfect for dart enthusiasts and casual players alike!
  ```

- **Keywords** (100 characters max):
  ```
  darts,dartboard,501,multiplayer,game,sports,pub,bar,precision
  ```

- **Support URL:** `https://quikdarts.com`
- **Marketing URL:** `https://quikdarts.com`

### Privacy Policy
Create a simple privacy policy at https://www.privacypolicygenerator.info/

Required if you use:
- ✅ Firebase (analytics, database)
- ✅ Online multiplayer (user data)

Host it at: `https://quikdarts.com/privacy.html`

### Age Rating
- **Rating:** 4+ (No objectionable content)
- **Gambling:** None
- **Violence:** None
- **Mature Content:** None

---

## 📦 Step 7: Archive and Upload

1. **Select "Any iOS Device (arm64)"** from Xcode device menu
2. **Product → Archive** (⌘+B won't work - must use Archive!)
3. **Wait for build** (2-5 minutes)
4. **Xcode Organizer opens** → Select your archive
5. **Click "Distribute App"**
6. **Select "App Store Connect"**
7. **Select "Upload"**
8. **Follow prompts** (use automatic signing)
9. **Upload** (may take 10-30 minutes)

---

## ✅ Step 8: Submit for Review

1. **Wait for processing** (App Store Connect):
   - Check: **TestFlight → iOS Builds**
   - Status should change to "Ready to Submit"
2. **Go to "App Store" tab**
3. **Select your app version (1.0)**
4. **Fill in all required fields:**
   - ✅ Screenshots
   - ✅ Description
   - ✅ Keywords
   - ✅ Support URL
   - ✅ Privacy Policy URL
   - ✅ Age Rating
   - ✅ Select build
5. **Click "Save"**
6. **Click "Submit for Review"**
7. **Answer export compliance questions:**
   - Uses encryption? **NO** (unless you add HTTPS APIs)
8. **Submit!**

---

## ⏱️ Timeline

- **Review Time:** 24-48 hours (usually)
- **Rejection:** Common for first apps - Apple will tell you what to fix
- **Approval:** App goes live immediately (or you can schedule)

---

## 🚀 Future Features (Post-Launch)

### Friend Invites (Your Request!)
To add contact/friend invitations:

1. **Add Contacts Permission:**
   ```swift
   import Contacts

   func requestContactsAccess() {
       CNContactStore().requestAccess(for: .contacts) { granted, error in
           // Handle permission
       }
   }
   ```

2. **Share Link Feature:**
   ```swift
   import MessageUI

   // Send invite via iMessage
   let message = "Join me in Quik Darts! [App Store Link]"
   ```

3. **Deep Linking:**
   - Custom URL scheme: `quikdarts://join/{gameId}`
   - Universal links: `https://quikdarts.com/join/{gameId}`

### Other Enhancements:
- Apple Watch companion app
- iCloud sync for achievements
- Widgets for quick stats
- ARKit for real dartboard overlay
- In-app purchases (custom dart themes)
- Leaderboards (Game Center)

---

## 🆘 Common Issues

### "Failed to register bundle identifier"
- Bundle ID already taken - try different name
- Fix: Change `PRODUCT_BUNDLE_IDENTIFIER` in Xcode

### "Code signing error"
- Not signed in to Apple Developer account
- Fix: Xcode → Preferences → Accounts → Add Apple ID

### "Missing required icon"
- App icon not set
- Fix: Add all icon sizes to Assets.xcassets

### "App crashes on device"
- Build for wrong architecture
- Fix: Archive for "Any iOS Device (arm64)"

### "Rejected - Missing Privacy Policy"
- Required for apps with online features
- Fix: Create privacy policy, add URL to App Store listing

---

## 📞 Support

- **Apple Developer Support:** https://developer.apple.com/support/
- **App Store Review Guidelines:** https://developer.apple.com/app-store/review/guidelines/
- **Xcode Documentation:** https://developer.apple.com/documentation/xcode

---

## ✨ Next Steps After Reading This

1. ✅ Merge the iOS PR: https://github.com/wheniwasjusthustlinbroke/quik-darts/pull/new/claude/ios-native-app-foundation-Kc2uZ
2. ✅ Sign up for Apple Developer Program ($99/year)
3. ✅ Open project in Xcode
4. ✅ Test on your iPhone
5. ✅ Create app icons
6. ✅ Submit to App Store!

**Your app is ready to go - just follow these steps!** 🎯
