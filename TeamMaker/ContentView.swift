// チーム分けアプリ（Swift Playgrounds 用）
// 使い方：Swift Playgrounds で「App」を新規作成し、ContentView.swift の中身をすべてこのファイルの内容に置き換えます。
// MyApp.swift はそのままで動きます。

import SwiftUI
import UniformTypeIdentifiers
import Compression

// MARK: - データの形

enum Gender: String, Codable, CaseIterable, Identifiable, Sendable {
    case male = "男"
    case female = "女"
    case unknown = "−"
    var id: String { rawValue }
}

struct Student: Identifiable, Codable, Hashable, Sendable {
    var id = UUID()
    var className: String   // 学級（例 2-2）
    var number: Int         // 出席番号
    var name: String
    var gender: Gender
    var level: Int          // 技能レベル 1〜5
    var sports: [String]    // 経験のあるスポーツ
    var isPresent: Bool = true  // 今日の授業に参加するか

    var tagText: String { sports.map { "#\($0)" }.joined(separator: " ") }

    // 名簿の並び順（学級 → 番号）
    static func rosterOrder(_ a: Student, _ b: Student) -> Bool {
        if a.className != b.className {
            return a.className.localizedStandardCompare(b.className) == .orderedAscending
        }
        return a.number < b.number
    }
}

func genderColor(_ g: Gender) -> Color {
    switch g {
    case .male: return .blue
    case .female: return .pink
    case .unknown: return .gray
    }
}

// MARK: - 名簿（iPad の中だけに保存します）

// アプリの中の「書類」フォルダに JSON ファイルとして保存します（アプリを閉じても残ります）
enum Storage {
    static var folder: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    static func load<T: Decodable>(_ type: T.Type, from name: String) -> T? {
        guard let data = try? Data(contentsOf: folder.appendingPathComponent(name)) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    static func save<T: Encodable>(_ value: T, to name: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: folder.appendingPathComponent(name), options: .atomic)
    }
}

// 過去に組んだチームの記録
struct HistoryEntry: Identifiable, Codable, Sendable {
    var id = UUID()
    var date: Date
    var title: String
    var subtitle: String
    var sport: String
    var teams: [Team]

    var memberCount: Int { teams.reduce(0) { $0 + $1.members.count } }
}

final class Roster: ObservableObject {
    @Published var students: [Student] = [] {
        didSet { Storage.save(students, to: rosterFile) }
    }
    @Published var history: [HistoryEntry] = [] {
        didSet { Storage.save(history, to: historyFile) }
    }
    private let rosterFile = "roster.json"
    private let historyFile = "history.json"
    private let oldSaveKey = "TeamMaker.students"   // 前の版の保存場所

    init() {
        if let saved = Storage.load([Student].self, from: rosterFile) {
            students = saved
        } else if let data = UserDefaults.standard.data(forKey: oldSaveKey),
                  let saved = try? JSONDecoder().decode([Student].self, from: data) {
            // 前の版で保存した名簿を引き継ぐ
            students = saved
            Storage.save(saved, to: rosterFile)
        }
        history = Storage.load([HistoryEntry].self, from: historyFile) ?? []
    }

    var classNames: [String] {
        Array(Set(students.map(\.className)))
            .sorted { $0.localizedStandardCompare($1) == .orderedAscending }
    }

    // 名簿に出てくるスポーツ（最初に出てきた順）
    var allSports: [String] {
        var result: [String] = []
        for s in students {
            for sp in s.sports where !result.contains(sp) { result.append(sp) }
        }
        return result
    }

    func sortStudents() {
        students.sort(by: Student.rosterOrder)
    }
}

// MARK: - Excel からの貼り付けを読み取る

struct ImportResult {
    var students: [Student] = []
    var sports: [String] = []
    var messages: [String] = []
}

enum RosterParser {
    // 1行目は見出し。「学級」「番号」「名前」「性別」「レベル」以外の列はすべてスポーツの列として扱い、
    // ○ などが入っていれば、その競技の経験者とします。
    static func parse(_ text: String) -> ImportResult {
        var result = ImportResult()
        let lines = text.components(separatedBy: .newlines)
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        guard let headerLine = lines.first else { return result }
        let header = cells(headerLine)

        func column(_ words: [String]) -> Int? {
            header.firstIndex { h in words.contains { h.contains($0) } }
        }
        guard let nameCol = column(["名前", "氏名"]) else {
            result.messages.append("1行目（見出し）に「名前」の列が見つかりません。")
            return result
        }
        let classCol = column(["学級", "クラス", "組"])
        let numberCol = column(["番号"])
        let genderCol = column(["性別"])
        let levelCol = column(["レベル", "技能"])
        let fixedCols = Set([nameCol, classCol, numberCol, genderCol, levelCol].compactMap { $0 })
        let sportCols = header.indices.filter { !fixedCols.contains($0) && !header[$0].isEmpty }
        result.sports = sportCols.map { header[$0] }

        for (i, line) in lines.dropFirst().enumerated() {
            let row = cells(line)
            func value(_ col: Int?) -> String {
                guard let c = col, c < row.count else { return "" }
                return row[c]
            }
            let name = value(nameCol)
            if name.isEmpty {
                result.messages.append("\(i + 2)行目：名前が空なので読み飛ばしました。")
                continue
            }
            let genderText = value(genderCol)
            let gender: Gender = genderText.contains("男") ? .male
                : (genderText.contains("女") ? .female : .unknown)
            let levelValue = number(value(levelCol))
            if levelCol != nil && levelValue == nil {
                result.messages.append("\(i + 2)行目（\(name)）：レベルが読めないので 3 にしました。")
            }
            let level = min(5, max(1, levelValue ?? 3))
            let sports = sportCols.filter { isMarked(value($0)) }.map { header[$0] }

            result.students.append(Student(
                className: normalizeClass(value(classCol)),
                number: number(value(numberCol)) ?? (i + 1),
                name: name,
                gender: gender,
                level: level,
                sports: sports
            ))
        }
        return result
    }

    static func cells(_ line: String) -> [String] {
        let sep: Character = line.contains("\t") ? "\t" : ","
        return line.split(separator: sep, omittingEmptySubsequences: false)
            .map {
                $0.trimmingCharacters(in: .whitespacesAndNewlines)
                    .trimmingCharacters(in: CharacterSet(charactersIn: "\"\u{FEFF}"))
            }
    }

    static func number(_ s: String) -> Int? {
        let half = s.applyingTransform(.fullwidthToHalfwidth, reverse: false) ?? s
        return Int(half.trimmingCharacters(in: .whitespaces))
    }

    static func isMarked(_ s: String) -> Bool {
        let t = s.trimmingCharacters(in: .whitespaces)
        if t.isEmpty { return false }
        return !["×", "✕", "x", "X", "-", "－", "0", "なし"].contains(t)
    }

    static func normalizeClass(_ s: String) -> String {
        var t = s.applyingTransform(.fullwidthToHalfwidth, reverse: false) ?? s
        t = t.trimmingCharacters(in: .whitespacesAndNewlines)
        // Excel が「2-2」を日付「2月2日」に変えてしまった場合は元に戻す
        if t.hasSuffix("日"), let m = t.firstIndex(of: "月") {
            let a = t[..<m]
            let b = t[t.index(after: m)..<t.index(before: t.endIndex)]
            if Int(a) != nil, Int(b) != nil { return "\(a)-\(b)" }
        }
        // Excel ファイルの中で日付が数値（例 46055）として保存されている場合も元に戻す
        if let serial = Int(t), serial >= 36526, serial < 73051 {
            var cal = Calendar(identifier: .gregorian)
            cal.timeZone = TimeZone(identifier: "UTC") ?? .current
            if let base = DateComponents(calendar: cal, year: 1899, month: 12, day: 30).date,
               let date = cal.date(byAdding: .day, value: serial, to: base) {
                let c = cal.dateComponents([.month, .day], from: date)
                if let m = c.month, let d = c.day { return "\(m)-\(d)" }
            }
        }
        return t.isEmpty ? "−" : t
    }
}

// MARK: - チーム分けの計算

struct Team: Identifiable, Codable, Sendable {
    var id = UUID()
    var number: Int
    var members: [Student]

    var levelTotal: Int { members.reduce(0) { $0 + $1.level } }
    var levelAverage: Double {
        members.isEmpty ? 0 : Double(levelTotal) / Double(members.count)
    }
    func count(_ g: Gender) -> Int { members.filter { $0.gender == g }.count }
    func experienced(_ sport: String) -> Int { members.filter { $0.sports.contains(sport) }.count }
}

enum TeamMaker {
    // 考え方：
    // 1. 経験者を先に、次にレベルの高い順に並べる（同じレベルの中はランダム）
    // 2. 1人ずつ「人数が少ない → 経験者が少ない → 同じ性別が少ない → レベル合計が低い」チームに入れる
    // これで人数・経験者・男女・レベルがそろいやすくなります。
    static func make(_ students: [Student], teamCount: Int, spreadSport: String?) -> [Team] {
        guard !students.isEmpty else { return [] }
        let n = max(1, min(teamCount, students.count))

        func isExp(_ s: Student) -> Bool {
            guard let sp = spreadSport else { return false }
            return s.sports.contains(sp)
        }

        let order = students
            .map { ($0, Double.random(in: 0..<1)) }
            .sorted { a, b in
                if isExp(a.0) != isExp(b.0) { return isExp(a.0) }
                if a.0.level != b.0.level { return a.0.level > b.0.level }
                return a.1 < b.1
            }
            .map { $0.0 }

        var groups = Array(repeating: [Student](), count: n)
        for s in order {
            // 同点のときはランダムなチームに入るよう、順番を混ぜてから選ぶ
            let best = groups.indices.shuffled().min { i, j in
                score(groups[i], for: s, isExp) < score(groups[j], for: s, isExp)
            }!
            groups[best].append(s)
        }

        return groups.shuffled().enumerated().map { index, members in
            Team(number: index + 1, members: members.sorted(by: Student.rosterOrder))
        }
    }

    private static func score(_ g: [Student], for s: Student,
                              _ isExp: (Student) -> Bool) -> (Int, Int, Int, Int) {
        let size = g.count
        let exp = isExp(s) ? g.filter(isExp).count : 0
        let sameGender = g.filter { $0.gender == s.gender }.count
        let level = g.reduce(0) { $0 + $1.level }
        return (size, exp, sameGender, level)
    }
}

// MARK: - 画面全体

struct ContentView: View {
    @StateObject private var roster = Roster()

    var body: some View {
        TabView {
            MakeTeamsView()
                .tabItem { Label("チーム分け", systemImage: "person.3.fill") }
            HistoryView()
                .tabItem { Label("履歴", systemImage: "clock.arrow.circlepath") }
            RosterView()
                .tabItem { Label("名簿", systemImage: "list.bullet") }
            ImportView()
                .tabItem { Label("読み込み", systemImage: "square.and.arrow.down") }
        }
        .environmentObject(roster)
    }
}

// MARK: - チーム分け画面

enum GenderFilter: String, CaseIterable, Identifiable {
    case all = "全員"
    case male = "男子"
    case female = "女子"
    var id: String { rawValue }
}

enum SplitMode: String, CaseIterable, Identifiable {
    case byCount = "チーム数で決める"
    case bySize = "1チームの人数で決める"
    var id: String { rawValue }
}

struct MakeTeamsView: View {
    @EnvironmentObject var roster: Roster
    @State var genderFilter: GenderFilter = .all
    @State var selectedClasses: Set<String> = []   // 空 ＝ 全学級
    @State var mode: SplitMode = .byCount
    @State var teamCount = 4
    @State var teamSize = 6
    @State var spreadSport = ""     // 空 ＝ 指定しない
    @State var teams: [Team] = []
    @State var usedSport = ""
    @State var usedSubtitle = ""
    @State var pdfTitle = ""
    @State var pdfShowLevel = false
    @State var savedEntryID: UUID?   // 今のチームを履歴に保存したか

    // 絞り込んだ対象の生徒（参加がオンの人だけ）
    var targets: [Student] {
        roster.students.filter { s in
            guard s.isPresent else { return false }
            if !selectedClasses.isEmpty && !selectedClasses.contains(s.className) { return false }
            switch genderFilter {
            case .all: return true
            case .male: return s.gender == .male
            case .female: return s.gender == .female
            }
        }
    }

    var plannedTeamCount: Int {
        let n = targets.count
        guard n > 0 else { return 0 }
        switch mode {
        case .byCount: return min(teamCount, n)
        case .bySize: return max(1, (n + teamSize - 1) / teamSize)
        }
    }

    var summary: String {
        let n = targets.count
        let k = plannedTeamCount
        guard k > 0 else {
            return "対象の生徒がいません（名簿の「参加」や絞り込みを確認してください）"
        }
        let small = n / k
        let large = (n + k - 1) / k
        let sizeText = small == large ? "\(small)人" : "\(small)〜\(large)人"
        return "対象 \(n)人 → \(k)チーム（1チーム \(sizeText)）"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    settings

                    Button {
                        makeTeams()
                    } label: {
                        Label(teams.isEmpty ? "チームを分ける" : "もう一度分ける", systemImage: "shuffle")
                            .font(.title3.bold())
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(targets.isEmpty)

                    if !teams.isEmpty {
                        sendSection
                    }

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 280), spacing: 12)], spacing: 12) {
                        ForEach(teams) { team in
                            TeamCard(team: team, sport: usedSport)
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("チーム分け")
        }
    }

    var settings: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("① 対象を絞り込む").font(.headline)
            Picker("性別", selection: $genderFilter) {
                ForEach(GenderFilter.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    Chip(title: "全学級", isOn: selectedClasses.isEmpty) {
                        selectedClasses.removeAll()
                    }
                    ForEach(roster.classNames, id: \.self) { cls in
                        Chip(title: cls, isOn: selectedClasses.contains(cls)) {
                            if selectedClasses.contains(cls) {
                                selectedClasses.remove(cls)
                            } else {
                                selectedClasses.insert(cls)
                            }
                        }
                    }
                }
            }

            Text("② チームの数").font(.headline)
            Picker("決め方", selection: $mode) {
                ForEach(SplitMode.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            if mode == .byCount {
                Stepper("チーム数：\(teamCount)", value: $teamCount, in: 2...12)
            } else {
                Stepper("1チームの人数：\(teamSize)人", value: $teamSize, in: 2...20)
            }

            Text("③ 経験者を散らす競技").font(.headline)
            Picker("経験者を散らす競技", selection: $spreadSport) {
                Text("指定しない").tag("")
                ForEach(roster.allSports, id: \.self) { Text("#\($0)").tag($0) }
            }
            .pickerStyle(.menu)

            Text(summary)
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.gray.opacity(0.12)))
    }

    func makeTeams() {
        let sport = spreadSport.isEmpty ? nil : spreadSport
        teams = TeamMaker.make(targets, teamCount: plannedTeamCount, spreadSport: sport)
        savedEntryID = nil
        usedSport = spreadSport

        // PDF の見出しの下に入れる説明（日付・対象・チーム数）
        let classes = selectedClasses.isEmpty ? "全学級"
            : selectedClasses.sorted { $0.localizedStandardCompare($1) == .orderedAscending }
                .joined(separator: "・")
        var parts = [Date().formatted(date: .long, time: .omitted),
                     "\(classes)／\(genderFilter.rawValue)",
                     "\(teams.count)チーム"]
        if !spreadSport.isEmpty { parts.append("★＝#\(spreadSport) 経験者") }
        usedSubtitle = parts.joined(separator: "　")
    }

    var pdfItem: TeamsPDF {
        TeamsPDF(title: pdfTitle.isEmpty ? "チーム分け" : pdfTitle,
                 subtitle: usedSubtitle,
                 teams: teams,
                 sport: usedSport,
                 showLevel: pdfShowLevel)
    }

    var sendSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("④ 保存する・生徒に送る").font(.headline)
            TextField("タイトル（例：バレーボール チーム分け）", text: $pdfTitle)
                .textFieldStyle(.roundedBorder)
            Toggle("技能レベルも載せる（生徒に送るときはオフがおすすめ）", isOn: $pdfShowLevel)
            HStack(spacing: 12) {
                Button {
                    saveToHistory()
                } label: {
                    Label(savedEntryID == nil ? "履歴に保存" : "保存しました",
                          systemImage: savedEntryID == nil ? "tray.and.arrow.down" : "checkmark.circle.fill")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.bordered)
                .disabled(savedEntryID != nil)

                ShareLink(item: pdfItem,
                          preview: SharePreview(pdfItem.title, image: Image(systemName: "doc.richtext"))) {
                    Label("PDFにして送る", systemImage: "square.and.arrow.up")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.bordered)
            }
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.gray.opacity(0.12)))
    }

    func saveToHistory() {
        let entry = HistoryEntry(date: Date(), title: pdfItem.title, subtitle: usedSubtitle,
                                 sport: usedSport, teams: teams)
        roster.history.insert(entry, at: 0)
        savedEntryID = entry.id
    }
}

// MARK: - 履歴画面

struct HistoryView: View {
    @EnvironmentObject var roster: Roster

    var body: some View {
        NavigationStack {
            List {
                if roster.history.isEmpty {
                    Text("まだ履歴がありません。チームを分けたあと「履歴に保存」を押すと、ここに残ります。")
                        .foregroundStyle(.secondary)
                }
                ForEach($roster.history) { $entry in
                    NavigationLink {
                        HistoryDetailView(entry: $entry)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(entry.title).font(.headline)
                            Text(entry.date.formatted(date: .long, time: .shortened))
                                .font(.caption)
                            Text("\(entry.teams.count)チーム・\(entry.memberCount)人　\(entry.subtitle)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
                .onDelete { offsets in
                    roster.history.remove(atOffsets: offsets)
                }
            }
            .navigationTitle("チーム分けの履歴")
            .toolbar {
                if !roster.history.isEmpty { EditButton() }
            }
        }
    }
}

struct HistoryDetailView: View {
    @Binding var entry: HistoryEntry
    @State var showLevel = false

    var pdfItem: TeamsPDF {
        TeamsPDF(title: entry.title, subtitle: entry.subtitle, teams: entry.teams,
                 sport: entry.sport, showLevel: showLevel)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 10) {
                    TextField("タイトル", text: $entry.title)
                        .font(.title2.bold())
                        .textFieldStyle(.roundedBorder)
                    Text("保存した日時：\(entry.date.formatted(date: .long, time: .shortened))")
                        .font(.callout)
                    Text(entry.subtitle)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    Toggle("技能レベルも載せる（生徒に送るときはオフがおすすめ）", isOn: $showLevel)
                    ShareLink(item: pdfItem,
                              preview: SharePreview(pdfItem.title, image: Image(systemName: "doc.richtext"))) {
                        Label("このチームをPDFにして送る", systemImage: "square.and.arrow.up")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                    }
                    .buttonStyle(.bordered)
                }
                .padding()
                .background(RoundedRectangle(cornerRadius: 12).fill(Color.gray.opacity(0.12)))

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 280), spacing: 12)], spacing: 12) {
                    ForEach(entry.teams) { team in
                        TeamCard(team: team, sport: entry.sport)
                    }
                }
            }
            .padding()
        }
        .navigationTitle(entry.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - PDF にして送る

struct TeamsPDF: Transferable, Sendable {
    let title: String
    let subtitle: String
    let teams: [Team]
    let sport: String
    let showLevel: Bool

    var fileName: String {
        let safeTitle = title
            .components(separatedBy: CharacterSet(charactersIn: "/\\:?*\"<>|"))
            .joined()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMdd"
        return "\(safeTitle)_\(formatter.string(from: Date())).pdf"
    }

    // 共有ボタンを押したときに、その場で最新のチームから PDF を作ります
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: .pdf) { pdf in
            SentTransferredFile(try await PDFMaker.makeFile(pdf))
        }
    }
}

@MainActor
enum PDFMaker {
    static let pageSize = CGSize(width: 595, height: 842)   // A4（縦）
    static let availableHeight: CGFloat = 690               // 見出しと余白を除いた高さ

    enum PDFError: Error { case cannotCreate }

    static func makeFile(_ pdf: TeamsPDF) throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(pdf.fileName)
        try? FileManager.default.removeItem(at: url)

        var box = CGRect(origin: .zero, size: pageSize)
        guard let context = CGContext(url as CFURL, mediaBox: &box, nil) else {
            throw PDFError.cannotCreate
        }
        let pages = paginate(pdf.teams)
        for (i, rows) in pages.enumerated() {
            let page = PDFPageView(pdf: pdf, rows: rows, pageNumber: i + 1, pageCount: pages.count)
                .frame(width: pageSize.width, height: pageSize.height)
                .background(Color.white)
                .environment(\.colorScheme, .light)
            let renderer = ImageRenderer(content: page)
            renderer.render { _, draw in
                context.beginPDFPage(nil)
                draw(context)
                context.endPDFPage()
            }
        }
        context.closePDF()
        return url
    }

    // 2チームずつ横に並べ、1ページに入りきらなくなったら次のページへ
    static func paginate(_ teams: [Team]) -> [[[Team]]] {
        let rows = stride(from: 0, to: teams.count, by: 2).map {
            Array(teams[$0..<min($0 + 2, teams.count)])
        }
        var pages: [[[Team]]] = []
        var current: [[Team]] = []
        var used: CGFloat = 0
        for row in rows {
            let height = (row.map { 50 + CGFloat($0.members.count) * 19 }.max() ?? 0) + 12
            if !current.isEmpty && used + height > availableHeight {
                pages.append(current)
                current = []
                used = 0
            }
            current.append(row)
            used += height
        }
        if !current.isEmpty { pages.append(current) }
        return pages
    }
}

struct PDFPageView: View {
    let pdf: TeamsPDF
    let rows: [[Team]]
    let pageNumber: Int
    let pageCount: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(pdf.title).font(.system(size: 22, weight: .bold))
                Text(pdf.subtitle).font(.system(size: 11)).foregroundStyle(Color.gray)
            }
            ForEach(rows.indices, id: \.self) { r in
                HStack(alignment: .top, spacing: 12) {
                    ForEach(rows[r]) { team in
                        PDFTeamCard(team: team, sport: pdf.sport, showLevel: pdf.showLevel)
                    }
                    if rows[r].count == 1 {
                        Color.clear.frame(maxWidth: .infinity, maxHeight: 1)
                    }
                }
            }
            Spacer(minLength: 0)
            if pageCount > 1 {
                Text("\(pageNumber) / \(pageCount)")
                    .font(.system(size: 10))
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(32)
        .foregroundStyle(Color.black)
    }
}

struct PDFTeamCard: View {
    let team: Team
    let sport: String
    let showLevel: Bool

    var color: Color { teamColors[(team.number - 1) % teamColors.count] }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("チーム \(team.number)").font(.system(size: 16, weight: .bold))
                Spacer()
                Text("\(team.members.count)人").font(.system(size: 11))
            }
            .foregroundStyle(Color.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity)
            .background(color)

            VStack(alignment: .leading, spacing: 3) {
                ForEach(team.members) { m in
                    HStack(spacing: 6) {
                        Text("\(m.className)-\(m.number)")
                            .font(.system(size: 10))
                            .foregroundStyle(Color.gray)
                            .frame(width: 44, alignment: .leading)
                        Text(m.name).font(.system(size: 13))
                        if !sport.isEmpty && m.sports.contains(sport) {
                            Text("★").font(.system(size: 10)).foregroundStyle(Color.orange)
                        }
                        Spacer(minLength: 0)
                        if showLevel {
                            Text("Lv\(m.level)").font(.system(size: 10))
                        }
                    }
                }
            }
            .padding(10)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(color, lineWidth: 1.5))
    }
}

struct Chip: View {
    let title: String
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(Capsule().fill(isOn ? Color.accentColor : Color.gray.opacity(0.2)))
                .foregroundStyle(isOn ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
    }
}

let teamColors: [Color] = [.red, .blue, .green, .orange, .purple, .pink,
                           .teal, .brown, .indigo, .cyan, .mint, .yellow]

struct TeamCard: View {
    let team: Team
    let sport: String

    var color: Color { teamColors[(team.number - 1) % teamColors.count] }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("チーム \(team.number)")
                .font(.title2.bold())
                .foregroundStyle(color)
            Text("\(team.members.count)人　男\(team.count(.male)) 女\(team.count(.female))　レベル合計 \(team.levelTotal)（平均 \(String(format: "%.1f", team.levelAverage))）")
                .font(.caption)
            if !sport.isEmpty {
                Text("#\(sport) 経験者 \(team.experienced(sport))人")
                    .font(.caption.bold())
                    .foregroundStyle(.orange)
            }
            Divider()
            ForEach(team.members) { m in
                HStack(spacing: 6) {
                    Text("\(m.className)-\(m.number)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(m.name)
                    if !sport.isEmpty && m.sports.contains(sport) {
                        Image(systemName: "star.fill")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                    Spacer()
                    Text(m.gender.rawValue).foregroundStyle(genderColor(m.gender))
                    LevelBadge(level: m.level)
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(color.opacity(0.1)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(color, lineWidth: 2))
    }
}

struct LevelBadge: View {
    let level: Int

    var body: some View {
        Text("Lv\(level)")
            .font(.caption.bold())
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Capsule().fill(Color.green.opacity(0.15 + Double(level) * 0.15)))
    }
}

// MARK: - 名簿画面（参加のオン・オフ、編集）

struct RosterView: View {
    @EnvironmentObject var roster: Roster
    @State var editing: Student?
    @State var confirmDeleteAll = false

    var presentCount: Int { roster.students.filter(\.isPresent).count }

    var body: some View {
        NavigationStack {
            List {
                if roster.students.isEmpty {
                    Text("名簿がありません。「読み込み」タブから貼り付けてください。")
                        .foregroundStyle(.secondary)
                }
                ForEach(roster.classNames, id: \.self) { cls in
                    Section(cls) {
                        ForEach($roster.students) { $s in
                            if s.className == cls {
                                StudentRow(student: $s) { editing = s }
                            }
                        }
                    }
                }
            }
            .navigationTitle("名簿（参加 \(presentCount) / \(roster.students.count)人）")
            .toolbar {
                ToolbarItemGroup(placement: .primaryAction) {
                    Button("全員参加") {
                        var list = roster.students
                        for i in list.indices { list[i].isPresent = true }
                        roster.students = list
                    }
                    Button("全削除", role: .destructive) { confirmDeleteAll = true }
                }
            }
            .confirmationDialog("名簿をすべて削除しますか？", isPresented: $confirmDeleteAll,
                                titleVisibility: .visible) {
                Button("すべて削除", role: .destructive) { roster.students.removeAll() }
            }
            .sheet(item: $editing) { s in
                StudentEditView(
                    student: s,
                    allSports: roster.allSports,
                    onSave: { updated in
                        if let i = roster.students.firstIndex(where: { $0.id == updated.id }) {
                            roster.students[i] = updated
                            roster.sortStudents()
                        }
                    },
                    onDelete: {
                        roster.students.removeAll { $0.id == s.id }
                    }
                )
            }
        }
    }
}

struct StudentRow: View {
    @Binding var student: Student
    var onEdit: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Toggle("参加", isOn: $student.isPresent)
                .labelsHidden()
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text("\(student.number)　\(student.name)")
                    if !student.isPresent {
                        Text("お休み・見学")
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
                if !student.sports.isEmpty {
                    Text(student.tagText)
                        .font(.caption)
                        .foregroundStyle(.blue)
                }
            }
            Spacer()
            Text(student.gender.rawValue).foregroundStyle(genderColor(student.gender))
            LevelBadge(level: student.level)
            Button(action: onEdit) {
                Image(systemName: "pencil.circle").font(.title2)
            }
            .buttonStyle(.borderless)
        }
        .opacity(student.isPresent ? 1 : 0.5)
    }
}

struct StudentEditView: View {
    @Environment(\.dismiss) var dismiss
    @State var student: Student
    let allSports: [String]
    var onSave: (Student) -> Void
    var onDelete: () -> Void
    @State var newSport = ""

    var sportChoices: [String] {
        var list = allSports
        for s in student.sports where !list.contains(s) { list.append(s) }
        return list
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("基本") {
                    TextField("名前", text: $student.name)
                    TextField("学級（例 2-2）", text: $student.className)
                    Stepper("番号：\(student.number)", value: $student.number, in: 1...60)
                    Picker("性別", selection: $student.gender) {
                        ForEach(Gender.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    Toggle("今日の授業に参加", isOn: $student.isPresent)
                }
                Section("技能レベル（1〜5）") {
                    Picker("技能レベル", selection: $student.level) {
                        ForEach(1...5, id: \.self) { Text("\($0)").tag($0) }
                    }
                    .pickerStyle(.segmented)
                }
                Section("経験のあるスポーツ") {
                    ForEach(sportChoices, id: \.self) { sp in
                        Toggle("#\(sp)", isOn: Binding(
                            get: { student.sports.contains(sp) },
                            set: { on in
                                if on {
                                    if !student.sports.contains(sp) { student.sports.append(sp) }
                                } else {
                                    student.sports.removeAll { $0 == sp }
                                }
                            }
                        ))
                    }
                    HStack {
                        TextField("新しいスポーツを追加", text: $newSport)
                        Button("追加") {
                            let sp = newSport.trimmingCharacters(in: .whitespaces)
                                .trimmingCharacters(in: CharacterSet(charactersIn: "#＃"))
                            if !sp.isEmpty && !student.sports.contains(sp) { student.sports.append(sp) }
                            newSport = ""
                        }
                        .disabled(newSport.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
                Section {
                    Button("この生徒を名簿から削除", role: .destructive) {
                        onDelete()
                        dismiss()
                    }
                }
            }
            .navigationTitle(student.name)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        onSave(student)
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - 読み込み画面（Excel からまとめて貼り付け）

struct ImportView: View {
    @EnvironmentObject var roster: Roster
    @State var text = ""
    @State var confirmReplace = false
    @State var message = ""
    @State var errorMessage = ""
    @State var fileMessage = ""
    @State var showImporter = false

    var templateSports: [String] {
        roster.allSports.isEmpty ? defaultSports : roster.allSports
    }

    var body: some View {
        let preview = RosterParser.parse(text)

        NavigationStack {
            Form {
                Section("保存されている名簿") {
                    if roster.students.isEmpty {
                        Text("まだ名簿がありません。下の欄に貼り付けて読み込んでください。")
                            .foregroundStyle(.secondary)
                    } else {
                        Label("\(roster.classNames.joined(separator: "・"))　計 \(roster.students.count)人",
                              systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Text("名簿は iPad に保存されています。アプリを閉じても残るので、次回から読み込み直す必要はありません。")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Excel ファイルで入力する") {
                    Text("""
                    1.「入力用の Excel ファイルを書き出す」を押し、「ファイルに保存」か Excel で開きます。
                    2. Excel で生徒を入力して保存します（性別・レベル・○ は選択肢から選べます。スポーツの列は増やしても構いません）。
                    3.「入力したファイルを読み込む」でそのファイルを選びます。
                    """)
                    .font(.callout)

                    ShareLink(item: RosterSheet(students: [], sports: templateSports,
                                                fileName: "名簿入力用.xlsx"),
                              preview: SharePreview("名簿入力用.xlsx", image: Image(systemName: "tablecells"))) {
                        Label("入力用の Excel ファイルを書き出す", systemImage: "square.and.arrow.up")
                    }
                    if !roster.students.isEmpty {
                        ShareLink(item: RosterSheet(students: roster.students, sports: templateSports,
                                                    fileName: "名簿（\(todayStamp())）.xlsx"),
                                  preview: SharePreview("今の名簿.xlsx", image: Image(systemName: "tablecells"))) {
                            Label("今の名簿を Excel に書き出す（直したいとき）", systemImage: "square.and.arrow.up")
                        }
                    }
                    Button {
                        showImporter = true
                    } label: {
                        Label("入力したファイルを読み込む", systemImage: "doc.badge.plus")
                    }
                    if !fileMessage.isEmpty {
                        Text(fileMessage).font(.caption).foregroundStyle(.blue)
                    }
                    if !errorMessage.isEmpty {
                        Text(errorMessage).font(.caption).foregroundStyle(.red)
                    }
                }

                Section("または、表をコピーして貼り付ける") {
                    Text("Excel で見出しの行ごと表をコピーして、下の欄に貼り付けます。")
                        .font(.callout)
                    Button("サンプルを入れてみる") { text = sampleRoster }
                    TextEditor(text: $text)
                        .frame(minHeight: 200)
                        .font(.system(.body, design: .monospaced))
                }

                if !text.isEmpty {
                    Section("読み取り結果") {
                        Text("生徒 \(preview.students.count)人")
                            .font(.headline)
                        if !preview.sports.isEmpty {
                            Text("スポーツ：" + preview.sports.map { "#\($0)" }.joined(separator: " "))
                                .foregroundStyle(.blue)
                        }
                        ForEach(preview.messages, id: \.self) { msg in
                            Text(msg).font(.caption).foregroundStyle(.red)
                        }
                        ForEach(preview.students.prefix(5)) { s in
                            Text("\(s.className)-\(s.number) \(s.name)　\(s.gender.rawValue)　Lv\(s.level)　\(s.tagText)")
                                .font(.caption)
                        }
                        if preview.students.count > 5 {
                            Text("…ほか \(preview.students.count - 5)人").font(.caption)
                        }
                    }

                    Section {
                        Button("名簿を置き換える") { confirmReplace = true }
                            .disabled(preview.students.isEmpty)
                        Button("今の名簿に追加する") {
                            roster.students.append(contentsOf: preview.students)
                            roster.sortStudents()
                            message = "\(preview.students.count)人を追加しました。"
                            text = ""
                        }
                        .disabled(preview.students.isEmpty)
                    }
                }

                if !message.isEmpty {
                    Section {
                        Text(message).foregroundStyle(.green)
                    }
                }
            }
            .navigationTitle("名簿の読み込み")
            .confirmationDialog("今の名簿を消して、読み取った名簿に置き換えますか？",
                                isPresented: $confirmReplace, titleVisibility: .visible) {
                Button("置き換える", role: .destructive) {
                    roster.students = preview.students.sorted(by: Student.rosterOrder)
                    message = "\(preview.students.count)人の名簿に置き換えました。"
                    text = ""
                    fileMessage = ""
                }
            }
            .fileImporter(isPresented: $showImporter,
                          allowedContentTypes: [.xlsx, .commaSeparatedText, .tabSeparatedText, .plainText]) { result in
                readFile(result)
            }
        }
    }

    // 選んだファイルを読み取り、貼り付け欄に入れる（あとは貼り付けと同じ流れで確認・保存）
    func readFile(_ result: Result<URL, Error>) {
        errorMessage = ""
        fileMessage = ""
        message = ""
        switch result {
        case .failure(let error):
            errorMessage = "ファイルを開けませんでした：\(error.localizedDescription)"
        case .success(let url):
            let canAccess = url.startAccessingSecurityScopedResource()
            defer { if canAccess { url.stopAccessingSecurityScopedResource() } }
            do {
                let data = try Data(contentsOf: url)
                if url.pathExtension.lowercased() == "xlsx" {
                    let rows = try XLSXReader.rows(from: data)
                    text = rows.map { row in
                        row.map { $0.replacingOccurrences(of: "\t", with: " ")
                                    .replacingOccurrences(of: "\n", with: " ") }
                            .joined(separator: "\t")
                    }
                    .joined(separator: "\n")
                } else {
                    // Excel の CSV は Shift_JIS のことが多いので、UTF-8 で読めなければ Shift_JIS で読む
                    text = String(data: data, encoding: .utf8)
                        ?? String(data: data, encoding: .shiftJIS)
                        ?? ""
                }
                if text.isEmpty {
                    errorMessage = "ファイルの中に読み取れる表がありませんでした。"
                } else {
                    fileMessage = "「\(url.lastPathComponent)」を読み取りました。下の「読み取り結果」を確認して、置き換えるか追加してください。"
                }
            } catch {
                errorMessage = "ファイルを読み取れませんでした：\(error.localizedDescription)"
            }
        }
    }
}

func todayStamp() -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyyMMdd"
    return formatter.string(from: Date())
}

let defaultSports = ["サッカー", "バレーボール", "バスケットボール", "ソフトボール",
                     "バドミントン", "卓球", "テニス", "陸上", "水泳", "ダンス"]

// MARK: - Excel（.xlsx）の書き出し・読み込み

extension UTType {
    static var xlsx: UTType { UTType("org.openxmlformats.spreadsheetml.sheet") ?? .data }
}

// 共有ボタンから書き出す名簿の Excel ファイル（students が空なら入力用テンプレート）
struct RosterSheet: Transferable, Sendable {
    let students: [Student]
    let sports: [String]
    let fileName: String

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: .xlsx) { sheet in
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(sheet.fileName)
            try? FileManager.default.removeItem(at: url)
            let data = XLSXWriter.roster(students: sheet.students.sorted(by: Student.rosterOrder),
                                         sports: sheet.sports)
            try data.write(to: url, options: .atomic)
            return SentTransferredFile(url)
        }
    }
}

enum XLSXWriter {
    static let lastRow = 300   // 選択肢（プルダウン）を付ける行の終わり

    static func roster(students: [Student], sports: [String]) -> Data {
        let header = ["学級", "番号", "名前", "性別", "レベル"] + sports
        var rows = ""
        rows += row(1, header.enumerated().map { textCell($0.offset, 1, $0.element, style: 2) })
        for (i, s) in students.enumerated() {
            let r = i + 2
            var cells = [textCell(0, r, s.className, style: 1),
                         numberCell(1, r, s.number, style: 3),
                         textCell(2, r, s.name, style: 0)]
            if s.gender != .unknown { cells.append(textCell(3, r, s.gender.rawValue, style: 3)) }
            cells.append(numberCell(4, r, s.level, style: 3))
            for (j, sp) in sports.enumerated() where s.sports.contains(sp) {
                cells.append(textCell(5 + j, r, "○", style: 3))
            }
            rows += row(r, cells)
        }

        let lastCol = columnName(header.count - 1)
        var validations = [
            validation("D2:D\(lastRow)", "男,女"),
            validation("E2:E\(lastRow)", "1,2,3,4,5"),
        ]
        if !sports.isEmpty { validations.append(validation("F2:\(lastCol)\(lastRow)", "○")) }

        let sportCols = sports.isEmpty ? ""
            : "<col min=\"6\" max=\"\(header.count)\" width=\"12\" style=\"3\" customWidth=\"1\"/>"

        let sheet = """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\
        <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>\
        <cols><col min="1" max="1" width="8" style="1" customWidth="1"/><col min="2" max="2" width="6" style="3" customWidth="1"/>\
        <col min="3" max="3" width="16" customWidth="1"/><col min="4" max="5" width="7" style="3" customWidth="1"/>\
        \(sportCols)</cols>\
        <sheetData>\(rows)</sheetData>\
        <dataValidations count="\(validations.count)">\(validations.joined())</dataValidations>\
        </worksheet>
        """

        let styles = """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\
        <fonts count="2"><font><sz val="11"/><name val="Yu Gothic"/></font><font><b/><sz val="11"/><name val="Yu Gothic"/></font></fonts>\
        <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>\
        <fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill></fills>\
        <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>\
        <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>\
        <cellXfs count="4">\
        <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>\
        <xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>\
        <xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>\
        <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center"/></xf>\
        </cellXfs>\
        <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>\
        </styleSheet>
        """

        let workbook = """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\
        <sheets><sheet name="名簿" sheetId="1" r:id="rId1"/></sheets></workbook>
        """

        let workbookRels = """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>\
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>\
        </Relationships>
        """

        let rootRels = """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>\
        </Relationships>
        """

        let contentTypes = """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\
        <Default Extension="xml" ContentType="application/xml"/>\
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>\
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>\
        <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>\
        </Types>
        """

        return Zip.stored([
            ("[Content_Types].xml", Data(contentTypes.utf8)),
            ("_rels/.rels", Data(rootRels.utf8)),
            ("xl/workbook.xml", Data(workbook.utf8)),
            ("xl/_rels/workbook.xml.rels", Data(workbookRels.utf8)),
            ("xl/styles.xml", Data(styles.utf8)),
            ("xl/worksheets/sheet1.xml", Data(sheet.utf8)),
        ])
    }

    static func row(_ r: Int, _ cells: [String]) -> String {
        "<row r=\"\(r)\">\(cells.joined())</row>"
    }

    static func textCell(_ col: Int, _ row: Int, _ text: String, style: Int) -> String {
        "<c r=\"\(columnName(col))\(row)\" s=\"\(style)\" t=\"inlineStr\"><is><t>\(escape(text))</t></is></c>"
    }

    static func numberCell(_ col: Int, _ row: Int, _ value: Int, style: Int) -> String {
        "<c r=\"\(columnName(col))\(row)\" s=\"\(style)\"><v>\(value)</v></c>"
    }

    static func validation(_ range: String, _ list: String) -> String {
        "<dataValidation type=\"list\" allowBlank=\"1\" showErrorMessage=\"1\" sqref=\"\(range)\"><formula1>\"\(list)\"</formula1></dataValidation>"
    }

    // 0 → A, 25 → Z, 26 → AA
    static func columnName(_ index: Int) -> String {
        var n = index + 1
        var name = ""
        while n > 0 {
            let r = (n - 1) % 26
            name = String(UnicodeScalar(UInt8(65 + r))) + name
            n = (n - 1) / 26
        }
        return name
    }

    static func escape(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }
}

enum XLSXReader {
    struct ReadError: LocalizedError {
        let errorDescription: String?
    }

    // 最初のシートを、行ごとの文字の表にして返します
    static func rows(from data: Data) throws -> [[String]] {
        let files = try Zip.entries(data)
        let shared = files["xl/sharedStrings.xml"].map { SharedStringsParser.parse($0) } ?? []
        guard let sheet = files[firstSheetPath(files)] else {
            throw ReadError(errorDescription: "Excel ファイルの中にシートが見つかりませんでした。")
        }
        return SheetParser.parse(sheet, shared: shared)
    }

    static func firstSheetPath(_ files: [String: Data]) -> String {
        if let wb = files["xl/workbook.xml"], let rels = files["xl/_rels/workbook.xml.rels"] {
            let sheets = ElementCollector.collect(wb).filter { $0.name == "sheet" }
            if let rid = sheets.first?.attrs.first(where: { $0.key == "r:id" || $0.key.hasSuffix(":id") })?.value,
               let target = ElementCollector.collect(rels)
                .first(where: { $0.name == "Relationship" && $0.attrs["Id"] == rid })?.attrs["Target"] {
                let path = target.hasPrefix("/") ? String(target.dropFirst()) : "xl/" + target
                if files[path] != nil { return path }
            }
        }
        return files.keys
            .filter { $0.hasPrefix("xl/worksheets/") && $0.hasSuffix(".xml") }
            .sorted { $0.localizedStandardCompare($1) == .orderedAscending }
            .first ?? ""
    }
}

// 「x:sheet」のような名前空間の付いた名前から「sheet」を取り出す
func localName(_ name: String) -> String {
    name.split(separator: ":").last.map(String.init) ?? name
}

final class ElementCollector: NSObject, XMLParserDelegate {
    var elements: [(name: String, attrs: [String: String])] = []

    static func collect(_ data: Data) -> [(name: String, attrs: [String: String])] {
        let collector = ElementCollector()
        let parser = XMLParser(data: data)
        parser.delegate = collector
        parser.parse()
        return collector.elements
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?,
                qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]) {
        elements.append((localName(elementName), attributeDict))
    }
}

final class SharedStringsParser: NSObject, XMLParserDelegate {
    var strings: [String] = []
    var current = ""
    var inText = false
    var phoneticDepth = 0   // ふりがな（rPh）の中の文字は読み飛ばす

    static func parse(_ data: Data) -> [String] {
        let p = SharedStringsParser()
        let parser = XMLParser(data: data)
        parser.delegate = p
        parser.parse()
        return p.strings
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?,
                qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]) {
        switch localName(elementName) {
        case "si": current = ""
        case "rPh": phoneticDepth += 1
        case "t": inText = phoneticDepth == 0
        default: break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if inText { current += string }
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?,
                qualifiedName qName: String?) {
        switch localName(elementName) {
        case "si": strings.append(current)
        case "rPh": phoneticDepth -= 1
        case "t": inText = false
        default: break
        }
    }
}

final class SheetParser: NSObject, XMLParserDelegate {
    let shared: [String]
    var cells: [Int: [Int: String]] = [:]
    var rowIndex = 0
    var nextCol = 0
    var col = 0
    var cellType = ""
    var value = ""
    var buffer = ""
    var reading = false

    init(shared: [String]) { self.shared = shared }

    static func parse(_ data: Data, shared: [String]) -> [[String]] {
        let p = SheetParser(shared: shared)
        let parser = XMLParser(data: data)
        parser.delegate = p
        parser.parse()
        guard let maxRow = p.cells.keys.max(), maxRow >= 1 else { return [] }
        let maxCol = p.cells.values.compactMap { $0.keys.max() }.max() ?? 0
        return (1...maxRow).map { r in
            (0...maxCol).map { c in p.cells[r]?[c] ?? "" }
        }
    }

    // 「B12」→ 列 1
    static func column(of ref: String) -> Int? {
        let letters = ref.prefix { $0.isLetter }
        guard !letters.isEmpty else { return nil }
        var n = 0
        for ch in letters.uppercased().unicodeScalars { n = n * 26 + Int(ch.value) - 64 }
        return n - 1
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?,
                qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]) {
        switch localName(elementName) {
        case "row":
            rowIndex = Int(attributeDict["r"] ?? "") ?? (rowIndex + 1)
            nextCol = 0
        case "c":
            col = SheetParser.column(of: attributeDict["r"] ?? "") ?? nextCol
            nextCol = col + 1
            cellType = attributeDict["t"] ?? ""
            value = ""
        case "v", "t":
            reading = true
            buffer = ""
        default: break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if reading { buffer += string }
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?,
                qualifiedName qName: String?) {
        switch localName(elementName) {
        case "v", "t":
            value += buffer
            reading = false
        case "c":
            var text = value
            if cellType == "s", let i = Int(value), i >= 0, i < shared.count { text = shared[i] }
            if cellType == "e" { text = "" }
            text = text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty { cells[rowIndex, default: [:]][col] = text }
        default: break
        }
    }
}

// MARK: - ZIP（.xlsx の中身は ZIP です）

enum Zip {
    struct ZipError: LocalizedError {
        let errorDescription: String?
    }

    // 圧縮しないで ZIP にまとめる（Excel はこの形でも開けます）
    static func stored(_ files: [(String, Data)]) -> Data {
        var out = Data()
        var central = Data()
        let (time, date) = dosDateTime(Date())
        for (name, data) in files {
            let nameData = Data(name.utf8)
            let crc = crc32(data)
            let offset = UInt32(out.count)
            let size = UInt32(data.count)

            out += le32(0x04034b50) + le16(20) + le16(0x0800) + le16(0) + le16(time) + le16(date)
            out += le32(crc) + le32(size) + le32(size) + le16(UInt16(nameData.count)) + le16(0)
            out += nameData + data

            central += le32(0x02014b50) + le16(20) + le16(20) + le16(0x0800) + le16(0)
            central += le16(time) + le16(date) + le32(crc) + le32(size) + le32(size)
            central += le16(UInt16(nameData.count)) + le16(0) + le16(0) + le16(0) + le16(0)
            central += le32(0) + le32(offset) + nameData
        }
        let centralOffset = UInt32(out.count)
        out += central
        out += le32(0x06054b50) + le16(0) + le16(0)
        out += le16(UInt16(files.count)) + le16(UInt16(files.count))
        out += le32(UInt32(central.count)) + le32(centralOffset) + le16(0)
        return out
    }

    // ZIP の中のファイルを取り出す
    static func entries(_ data: Data) throws -> [String: Data] {
        let b = [UInt8](data)
        func u16(_ o: Int) -> Int { Int(b[o]) | Int(b[o + 1]) << 8 }
        func u32(_ o: Int) -> Int { u16(o) | u16(o + 2) << 16 }

        let notExcel = ZipError(errorDescription: "Excel（.xlsx）ファイルとして読み取れませんでした。")
        guard b.count >= 22 else { throw notExcel }
        var end = -1
        var i = b.count - 22
        while i >= max(0, b.count - 22 - 65535) {
            if u32(i) == 0x06054b50 { end = i; break }
            i -= 1
        }
        guard end >= 0 else { throw notExcel }

        let count = u16(end + 10)
        var p = u32(end + 16)
        var result: [String: Data] = [:]
        for _ in 0..<count {
            guard p + 46 <= b.count, u32(p) == 0x02014b50 else { throw notExcel }
            let method = u16(p + 10)
            let compressedSize = u32(p + 20)
            let size = u32(p + 24)
            let nameLength = u16(p + 28)
            let extraLength = u16(p + 30)
            let commentLength = u16(p + 32)
            let local = u32(p + 42)
            guard p + 46 + nameLength <= b.count else { throw notExcel }
            let name = String(decoding: b[(p + 46)..<(p + 46 + nameLength)], as: UTF8.self)
            p += 46 + nameLength + extraLength + commentLength

            guard local + 30 <= b.count else { continue }
            let start = local + 30 + u16(local + 26) + u16(local + 28)
            guard start + compressedSize <= b.count else { continue }
            let body = Array(b[start..<(start + compressedSize)])
            if method == 0 {
                result[name] = Data(body)
            } else if method == 8, let inflated = inflate(body, size: size) {
                result[name] = inflated
            }
        }
        return result
    }

    static func inflate(_ source: [UInt8], size: Int) -> Data? {
        guard size > 0 else { return Data() }
        var destination = [UInt8](repeating: 0, count: size)
        let written = compression_decode_buffer(&destination, size, source, source.count,
                                                nil, COMPRESSION_ZLIB)
        return written > 0 ? Data(destination[0..<written]) : nil
    }

    static let crcTable: [UInt32] = (0..<256).map { i -> UInt32 in
        var c = UInt32(i)
        for _ in 0..<8 { c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1 }
        return c
    }

    static func crc32(_ data: Data) -> UInt32 {
        var c: UInt32 = 0xFFFFFFFF
        for byte in data { c = crcTable[Int((c ^ UInt32(byte)) & 0xFF)] ^ (c >> 8) }
        return c ^ 0xFFFFFFFF
    }

    static func dosDateTime(_ date: Date) -> (UInt16, UInt16) {
        let c = Calendar(identifier: .gregorian)
            .dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        let time = (c.hour ?? 0) << 11 | (c.minute ?? 0) << 5 | (c.second ?? 0) / 2
        let day = max(0, (c.year ?? 1980) - 1980) << 9 | (c.month ?? 1) << 5 | (c.day ?? 1)
        return (UInt16(time), UInt16(day))
    }

    static func le16(_ v: UInt16) -> Data { withUnsafeBytes(of: v.littleEndian) { Data($0) } }
    static func le32(_ v: UInt32) -> Data { withUnsafeBytes(of: v.littleEndian) { Data($0) } }
}

// 動作確認用のサンプル（架空の生徒です）
let sampleRoster = """
学級\t番号\t名前\t性別\tレベル\tサッカー\tバレーボール\tバスケットボール\t野球
2-2\t1\t青木 一郎\t男\t4\t○\t\t\t
2-2\t2\t石井 健太\t男\t3\t\t\t○\t
2-2\t3\t上田 翔\t男\t5\t○\t\t\t○
2-2\t4\t岡本 大輝\t男\t2\t\t\t\t
2-2\t5\t加藤 さくら\t女\t4\t\t○\t\t
2-2\t6\t木村 美咲\t女\t3\t\t\t○\t
2-2\t7\t小林 結衣\t女\t2\t\t\t\t
2-2\t8\t佐藤 陽菜\t女\t5\t\t○\t○\t
2-4\t1\t清水 拓海\t男\t3\t○\t\t\t
2-4\t2\t鈴木 蓮\t男\t4\t\t\t\t○
2-4\t3\t高橋 悠真\t男\t1\t\t\t\t
2-4\t4\t田中 湊\t男\t5\t○\t\t○\t
2-4\t5\t中村 葵\t女\t3\t\t○\t\t
2-4\t6\t西田 凛\t女\t4\t○\t\t\t
2-4\t7\t橋本 芽依\t女\t1\t\t\t\t
2-4\t8\t藤田 心春\t女\t3\t\t○\t\t
"""
