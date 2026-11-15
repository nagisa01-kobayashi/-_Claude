// チーム分けアプリ（Swift Playgrounds 用）
// 使い方：Swift Playgrounds で「App」を新規作成し、ContentView.swift の中身をすべてこのファイルの内容に置き換えます。
// MyApp.swift はそのままで動きます。

import SwiftUI
import UniformTypeIdentifiers

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

final class Roster: ObservableObject {
    @Published var students: [Student] = [] {
        didSet { save() }
    }
    private let saveKey = "TeamMaker.students"

    init() {
        if let data = UserDefaults.standard.data(forKey: saveKey),
           let saved = try? JSONDecoder().decode([Student].self, from: data) {
            students = saved
        }
    }

    private func save() {
        if let data = try? JSONEncoder().encode(students) {
            UserDefaults.standard.set(data, forKey: saveKey)
        }
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
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
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
        return t.isEmpty ? "−" : t
    }
}

// MARK: - チーム分けの計算

struct Team: Identifiable, Sendable {
    let id = UUID()
    let number: Int
    let members: [Student]

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
            Text("④ 生徒に送る").font(.headline)
            TextField("PDFのタイトル（例：バレーボール チーム分け）", text: $pdfTitle)
                .textFieldStyle(.roundedBorder)
            Toggle("技能レベルも載せる（生徒に送るときはオフがおすすめ）", isOn: $pdfShowLevel)
            ShareLink(item: pdfItem,
                      preview: SharePreview(pdfItem.title, image: Image(systemName: "doc.richtext"))) {
                Label("PDFにして送る", systemImage: "square.and.arrow.up")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.bordered)
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.gray.opacity(0.12)))
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

    var body: some View {
        let preview = RosterParser.parse(text)

        NavigationStack {
            Form {
                Section("使い方") {
                    Text("""
                    1. Excel で 1行目を見出しにします：学級／番号／名前／性別／レベル／サッカー／バレーボール…
                    2. スポーツの列には、経験があれば ○ を入れます（空欄なら経験なし）。
                    3. 見出しごと表をコピーして、下の欄に貼り付けます。
                    """)
                    .font(.callout)
                    Button("サンプルを入れてみる") { text = sampleRoster }
                }

                Section("ここに貼り付け") {
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
            .confirmationDialog("今の名簿を消して、貼り付けた名簿に置き換えますか？",
                                isPresented: $confirmReplace, titleVisibility: .visible) {
                Button("置き換える", role: .destructive) {
                    roster.students = preview.students.sorted(by: Student.rosterOrder)
                    message = "\(preview.students.count)人の名簿に置き換えました。"
                    text = ""
                }
            }
        }
    }
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
