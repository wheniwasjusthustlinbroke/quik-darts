import SwiftUI

// MARK: - Theme ID Constants (no magic strings)
enum DartboardThemeId: String, CaseIterable, Codable, Identifiable {
    case classic = "classic"
    case proWire = "proWire"
    case neonGlow = "neonGlow"
    case goldElite = "goldElite"
    case stealth = "stealth"

    var id: String { rawValue }
}

// MARK: - Neon Color Options
enum NeonColorOption: String, CaseIterable, Codable, Identifiable {
    case cyan = "cyan"
    case pink = "pink"
    case green = "green"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .cyan: return "Cyan"
        case .pink: return "Pink"
        case .green: return "Green"
        }
    }

    var color: Color {
        switch self {
        case .cyan: return Color(red: 0, green: 1, blue: 1)
        case .pink: return Color(red: 1, green: 0, blue: 1)
        case .green: return Color(red: 0, green: 1, blue: 0.4)
        }
    }

    var glowColor: Color {
        color.opacity(0.6)
    }
}

// MARK: - Theme Colors Structure
struct DartboardThemeColors {
    let segmentPrimary: Color
    let segmentSecondary: Color
    let doubleTripleEven: Color
    let doubleTripleOdd: Color
    let outerBull: Color
    let innerBull: Color
    let wireColor: Color
    let wireHighlight: Color
    let chromeRing: Color
    let numberRing: Color
    let numberText: Color
    let frameColor: Color
    let boardBackground: Color

    // Optional special colors
    var neonGlow: Color?
    var neonPrimary: Color?
    var metallicSheen: Color?
}

// MARK: - Theme Effects Structure
struct DartboardThemeEffects {
    let useSisalTexture: Bool
    let useWoodGrain: Bool
    let useChromeGradient: Bool
    let useBoardLighting: Bool
    let glowEffect: Bool
    let pulseAnimation: Bool
    let wireWidth: CGFloat
    let shadowIntensity: Double
    var useMetallicSheen: Bool = false
}

// MARK: - Main Theme Structure
struct DartboardTheme: Identifiable {
    let id: DartboardThemeId
    let name: String
    let description: String
    let icon: String
    let colors: DartboardThemeColors
    let effects: DartboardThemeEffects

    // For neon theme, provide color options
    var neonColorOptions: [NeonColorOption]?
    var defaultNeonColor: NeonColorOption?

    // Dynamic colors for neon theme
    func getColors(neonColor: NeonColorOption? = nil) -> DartboardThemeColors {
        if id == .neonGlow, let neon = neonColor ?? defaultNeonColor {
            return DartboardTheme.neonColors(for: neon)
        }
        return colors
    }

    // Generate neon theme colors based on selected neon color
    private static func neonColors(for neonColor: NeonColorOption) -> DartboardThemeColors {
        DartboardThemeColors(
            segmentPrimary: Color(red: 0.039, green: 0.039, blue: 0.071),
            segmentSecondary: Color(red: 0.102, green: 0.102, blue: 0.157),
            doubleTripleEven: Color(red: 0.165, green: 0.039, blue: 0.102),
            doubleTripleOdd: Color(red: 0.039, green: 0.102, blue: 0.102),
            outerBull: Color(red: 0.039, green: 0.102, blue: 0.102),
            innerBull: Color(red: 0.165, green: 0.039, blue: 0.102),
            wireColor: neonColor.color,
            wireHighlight: neonColor.glowColor,
            chromeRing: Color(red: 0.102, green: 0.102, blue: 0.157),
            numberRing: Color(red: 0.039, green: 0.039, blue: 0.071),
            numberText: neonColor.color,
            frameColor: neonColor.color.opacity(0.8),
            boardBackground: Color(red: 0.02, green: 0.02, blue: 0.031),
            neonGlow: neonColor.glowColor,
            neonPrimary: neonColor.color
        )
    }
}

// MARK: - Theme Definitions
extension DartboardTheme {

    // Classic theme - Traditional dartboard with gold brass outer ring
    static let classic = DartboardTheme(
        id: .classic,
        name: "Classic",
        description: "Traditional dartboard with gold brass outer ring",
        icon: "🎯",
        colors: DartboardThemeColors(
            segmentPrimary: Color(red: 0.039, green: 0.039, blue: 0.039),      // #0a0a0a
            segmentSecondary: Color(red: 0.96, green: 0.94, blue: 0.91),       // #f5f0e8
            doubleTripleEven: Color(red: 0.722, green: 0.137, blue: 0.165),    // #b8232a
            doubleTripleOdd: Color(red: 0.051, green: 0.420, blue: 0.180),     // #0d6b2e
            outerBull: Color(red: 0.051, green: 0.420, blue: 0.180),
            innerBull: Color(red: 0.722, green: 0.137, blue: 0.165),
            wireColor: Color(red: 0.165, green: 0.165, blue: 0.165),           // #2a2a2a
            wireHighlight: Color.white.opacity(0.6),
            chromeRing: Color(red: 0.75, green: 0.75, blue: 0.75),             // #c0c0c0
            numberRing: Color(red: 0.102, green: 0.102, blue: 0.180),          // #1a1a2e
            numberText: Color(red: 0.96, green: 0.94, blue: 0.91),
            frameColor: Color(red: 0.722, green: 0.533, blue: 0.043),          // #b8860b
            boardBackground: Color(red: 0.102, green: 0.102, blue: 0.102)
        ),
        effects: DartboardThemeEffects(
            useSisalTexture: true,
            useWoodGrain: true,
            useChromeGradient: true,
            useBoardLighting: true,
            glowEffect: false,
            pulseAnimation: false,
            wireWidth: 1.5,
            shadowIntensity: 0.3
        )
    )

    // Pro Wire theme - Tournament style with thin metal wire dividers
    static let proWire = DartboardTheme(
        id: .proWire,
        name: "Pro Wire",
        description: "Tournament style with thin metal wire dividers",
        icon: "🏆",
        colors: DartboardThemeColors(
            segmentPrimary: Color(red: 0.039, green: 0.039, blue: 0.039),
            segmentSecondary: Color(red: 0.91, green: 0.89, blue: 0.86),       // #e8e4dc
            doubleTripleEven: Color(red: 0.769, green: 0.118, blue: 0.227),    // #c41e3a
            doubleTripleOdd: Color(red: 0.102, green: 0.545, blue: 0.271),     // #1a8b45
            outerBull: Color(red: 0.102, green: 0.545, blue: 0.271),
            innerBull: Color(red: 0.769, green: 0.118, blue: 0.227),
            wireColor: Color(red: 0.831, green: 0.831, blue: 0.831),           // #d4d4d4
            wireHighlight: Color.white.opacity(0.9),
            chromeRing: Color(red: 0.878, green: 0.878, blue: 0.878),          // #e0e0e0
            numberRing: Color(red: 0.102, green: 0.102, blue: 0.180),
            numberText: Color.white,
            frameColor: Color(red: 0.627, green: 0.627, blue: 0.627),          // #a0a0a0
            boardBackground: Color(red: 0.102, green: 0.102, blue: 0.102)
        ),
        effects: DartboardThemeEffects(
            useSisalTexture: true,
            useWoodGrain: false,
            useChromeGradient: true,
            useBoardLighting: true,
            glowEffect: false,
            pulseAnimation: false,
            wireWidth: 0.8,
            shadowIntensity: 0.2
        )
    )

    // Neon Glow theme - Dark board with glowing neon wires
    static let neonGlow = DartboardTheme(
        id: .neonGlow,
        name: "Neon Glow",
        description: "Dark board with glowing neon wires",
        icon: "✨",
        colors: DartboardThemeColors(
            // Default cyan colors - will be overridden by getColors()
            segmentPrimary: Color(red: 0.039, green: 0.039, blue: 0.071),
            segmentSecondary: Color(red: 0.102, green: 0.102, blue: 0.157),
            doubleTripleEven: Color(red: 0.165, green: 0.039, blue: 0.102),
            doubleTripleOdd: Color(red: 0.039, green: 0.102, blue: 0.102),
            outerBull: Color(red: 0.039, green: 0.102, blue: 0.102),
            innerBull: Color(red: 0.165, green: 0.039, blue: 0.102),
            wireColor: Color(red: 0, green: 1, blue: 1),
            wireHighlight: Color(red: 0, green: 1, blue: 1).opacity(0.6),
            chromeRing: Color(red: 0.102, green: 0.102, blue: 0.157),
            numberRing: Color(red: 0.039, green: 0.039, blue: 0.071),
            numberText: Color(red: 0, green: 1, blue: 1),
            frameColor: Color(red: 0, green: 0.831, blue: 1),
            boardBackground: Color(red: 0.02, green: 0.02, blue: 0.031),
            neonGlow: Color(red: 0, green: 1, blue: 1).opacity(0.6),
            neonPrimary: Color(red: 0, green: 1, blue: 1)
        ),
        effects: DartboardThemeEffects(
            useSisalTexture: false,
            useWoodGrain: false,
            useChromeGradient: false,
            useBoardLighting: false,
            glowEffect: true,
            pulseAnimation: true,
            wireWidth: 2.0,
            shadowIntensity: 0.1
        ),
        neonColorOptions: NeonColorOption.allCases,
        defaultNeonColor: .cyan
    )

    // Gold Elite theme - Black and gold luxury premium theme
    static let goldElite = DartboardTheme(
        id: .goldElite,
        name: "Gold Elite",
        description: "Black and gold luxury premium theme",
        icon: "👑",
        colors: DartboardThemeColors(
            segmentPrimary: Color(red: 0.039, green: 0.039, blue: 0.039),
            segmentSecondary: Color(red: 0.102, green: 0.102, blue: 0.102),
            doubleTripleEven: Color(red: 0.722, green: 0.533, blue: 0.043),    // #b8860b
            doubleTripleOdd: Color(red: 0.855, green: 0.647, blue: 0.125),     // #daa520
            outerBull: Color(red: 0.855, green: 0.647, blue: 0.125),
            innerBull: Color(red: 1.0, green: 0.843, blue: 0.0),               // #ffd700
            wireColor: Color(red: 1.0, green: 0.843, blue: 0.0),
            wireHighlight: Color(red: 1.0, green: 0.843, blue: 0.0).opacity(0.8),
            chromeRing: Color(red: 1.0, green: 0.843, blue: 0.0),
            numberRing: Color(red: 0.039, green: 0.039, blue: 0.039),
            numberText: Color(red: 1.0, green: 0.843, blue: 0.0),
            frameColor: Color(red: 1.0, green: 0.843, blue: 0.0),
            boardBackground: Color(red: 0.02, green: 0.02, blue: 0.02),
            metallicSheen: Color(red: 1.0, green: 0.843, blue: 0.0).opacity(0.15)
        ),
        effects: DartboardThemeEffects(
            useSisalTexture: false,
            useWoodGrain: false,
            useChromeGradient: false,
            useBoardLighting: true,
            glowEffect: false,
            pulseAnimation: false,
            wireWidth: 1.2,
            shadowIntensity: 0.4,
            useMetallicSheen: true
        )
    )

    // Stealth theme - Minimal dark theme (hard mode aesthetic)
    static let stealth = DartboardTheme(
        id: .stealth,
        name: "Stealth",
        description: "Minimal dark theme - hard mode aesthetic",
        icon: "🌑",
        colors: DartboardThemeColors(
            segmentPrimary: Color(red: 0.039, green: 0.039, blue: 0.039),
            segmentSecondary: Color(red: 0.082, green: 0.082, blue: 0.082),    // #151515
            doubleTripleEven: Color(red: 0.102, green: 0.102, blue: 0.102),    // #1a1a1a
            doubleTripleOdd: Color(red: 0.133, green: 0.133, blue: 0.133),     // #222222
            outerBull: Color(red: 0.102, green: 0.102, blue: 0.102),
            innerBull: Color(red: 0.145, green: 0.145, blue: 0.145),           // #252525
            wireColor: Color(red: 0.2, green: 0.2, blue: 0.2),                 // #333333
            wireHighlight: Color.white.opacity(0.1),
            chromeRing: Color(red: 0.102, green: 0.102, blue: 0.102),
            numberRing: Color(red: 0.039, green: 0.039, blue: 0.039),
            numberText: Color(red: 0.267, green: 0.267, blue: 0.267),          // #444444
            frameColor: Color(red: 0.082, green: 0.082, blue: 0.082),
            boardBackground: Color(red: 0.02, green: 0.02, blue: 0.02)
        ),
        effects: DartboardThemeEffects(
            useSisalTexture: false,
            useWoodGrain: false,
            useChromeGradient: false,
            useBoardLighting: false,
            glowEffect: false,
            pulseAnimation: false,
            wireWidth: 0.5,
            shadowIntensity: 0.1
        )
    )

    // All themes collection
    static let allThemes: [DartboardTheme] = [
        .classic,
        .proWire,
        .neonGlow,
        .goldElite,
        .stealth
    ]

    // Get theme by ID with validation
    static func getTheme(by id: DartboardThemeId) -> DartboardTheme {
        allThemes.first { $0.id == id } ?? .classic
    }

    // Default theme
    static let defaultTheme = classic
}

// MARK: - Theme Preference Storage
struct ThemePreference: Codable {
    var themeId: DartboardThemeId
    var neonColor: NeonColorOption
    var savedAt: Date

    init(themeId: DartboardThemeId = .classic, neonColor: NeonColorOption = .cyan) {
        self.themeId = themeId
        self.neonColor = neonColor
        self.savedAt = Date()
    }
}

// MARK: - Theme Manager for persistence
class ThemeManager: ObservableObject {
    static let shared = ThemeManager()

    private let userDefaultsKey = "quikdarts_theme"

    @Published var selectedThemeId: DartboardThemeId {
        didSet { savePreference() }
    }

    @Published var selectedNeonColor: NeonColorOption {
        didSet { savePreference() }
    }

    var currentTheme: DartboardTheme {
        DartboardTheme.getTheme(by: selectedThemeId)
    }

    var currentColors: DartboardThemeColors {
        currentTheme.getColors(neonColor: selectedNeonColor)
    }

    private init() {
        // Load saved preference
        if let data = UserDefaults.standard.data(forKey: userDefaultsKey),
           let preference = try? JSONDecoder().decode(ThemePreference.self, from: data) {
            self.selectedThemeId = preference.themeId
            self.selectedNeonColor = preference.neonColor
        } else {
            self.selectedThemeId = .classic
            self.selectedNeonColor = .cyan
        }
    }

    private func savePreference() {
        let preference = ThemePreference(
            themeId: selectedThemeId,
            neonColor: selectedNeonColor
        )
        if let data = try? JSONEncoder().encode(preference) {
            UserDefaults.standard.set(data, forKey: userDefaultsKey)
        }
    }

    func selectTheme(_ themeId: DartboardThemeId) {
        selectedThemeId = themeId
    }

    func selectNeonColor(_ color: NeonColorOption) {
        selectedNeonColor = color
    }
}
