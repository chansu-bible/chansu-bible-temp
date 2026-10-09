import SwiftUI
import WidgetKit

// 앱이 App Group에 적어 둔 "오늘의 장면"(mobile/src/widgets/updateWidgets.tsx의 WidgetSnapshot JSON)을 그린다.
private let appGroup = "group.com.chansubible.app"

struct TodayScene: Decodable {
  let sceneId: String
  let kicker: String
  let title: String
  let detail: String
}

struct SceneEntry: TimelineEntry {
  let date: Date
  let scene: TodayScene?
  let image: UIImage?
}

struct Provider: TimelineProvider {
  private let sample = TodayScene(sceneId: "", kicker: "오늘의 장면 · 창세기 1장", title: "빛이 있으라", detail: "1:1~5절")

  func placeholder(in context: Context) -> SceneEntry {
    SceneEntry(date: Date(), scene: sample, image: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (SceneEntry) -> Void) {
    completion(entry() ?? SceneEntry(date: Date(), scene: sample, image: nil))
  }

  // 앱이 읽기 기록을 바꾸면 다시 그리게 한다(ExtensionStorage.reloadWidget). 날이 바뀌면 한 번 더 읽는다.
  func getTimeline(in context: Context, completion: @escaping (Timeline<SceneEntry>) -> Void) {
    let calendar = Calendar.current
    let tomorrow = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: Date())) ?? Date().addingTimeInterval(86_400)
    completion(Timeline(entries: [entry() ?? SceneEntry(date: Date(), scene: nil, image: nil)], policy: .after(tomorrow)))
  }

  // 앱이 적은 장면과, 그 장면의 그림(그림 id가 같을 때만)
  private func entry() -> SceneEntry? {
    let defaults = UserDefaults(suiteName: appGroup)
    guard let json = defaults?.string(forKey: "todayScene"),
          let data = json.data(using: .utf8),
          let scene = try? JSONDecoder().decode(TodayScene.self, from: data) else { return nil }
    var image: UIImage?
    if defaults?.string(forKey: "todaySceneImageId") == scene.sceneId,
       let base64 = defaults?.string(forKey: "todaySceneImage"),
       let bytes = Data(base64Encoded: base64) {
      image = UIImage(data: bytes)
    }
    return SceneEntry(date: Date(), scene: scene, image: image)
  }
}

struct TodaySceneView: View {
  let entry: SceneEntry

  var body: some View {
    if let scene = entry.scene {
      HStack(spacing: 0) {
        if let image = entry.image {
          Image(uiImage: image)
            .resizable()
            .scaledToFill()
            .frame(width: 140)
            .frame(maxHeight: .infinity)
            .clipped()
        }
        VStack(alignment: .leading, spacing: 4) {
          Text(scene.kicker)
            .font(.system(size: 11))
            .foregroundStyle(Color("widgetInkSoft"))
          Text(scene.title)
            .font(.system(size: 17, weight: .semibold, design: .serif))
            .foregroundStyle(Color("widgetInk"))
            .lineLimit(2)
          Text(scene.detail)
            .font(.system(size: 12))
            .foregroundStyle(Color("widgetInkSoft"))
            .lineLimit(1)
          Spacer(minLength: 6)
          HStack(spacing: 6) {
            Image(systemName: "play.fill").font(.system(size: 10))
            Text("이어 읽기").font(.system(size: 12, weight: .medium))
          }
          .foregroundStyle(.white)
          .padding(.horizontal, 12)
          .frame(height: 30)
          .background(Capsule().fill(Color("widgetAccent")))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        Spacer(minLength: 0)
      }
    } else {
      VStack(alignment: .leading, spacing: 6) {
        Text("장면 성경")
          .font(.system(size: 17, weight: .semibold, design: .serif))
          .foregroundStyle(Color("widgetInk"))
        Text("앱을 열면 이어 읽을 장면이 여기 보여요.")
          .font(.system(size: 12))
          .foregroundStyle(Color("widgetInkSoft"))
      }
      .padding(16)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
  }
}

struct TodaySceneWidget: Widget {
  let kind = "TodayScene"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      TodaySceneView(entry: entry)
        .containerBackground(for: .widget) { Color("widgetBackground") }
        .widgetURL(URL(string: "chansubible://read"))
    }
    .configurationDisplayName("오늘의 장면")
    .description("이어 읽을 장면과 연속으로 읽은 날을 보여 줘요.")
    .supportedFamilies([.systemMedium])
    .contentMarginsDisabled()
  }
}

@main
struct ChansuBibleWidgets: WidgetBundle {
  var body: some Widget {
    TodaySceneWidget()
  }
}
