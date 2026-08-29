import { useRef } from "react";
import { useKeyboard } from "@opentui/react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { GameDetails } from "../types/steamGame.ts";
import TurndownService from "turndown"
interface GameDetailViewProps {
  gameDetails: GameDetails;
  onBack: () => void;
}

// Rows a single screenshot occupies. Terminal cells are roughly twice as tall
// as they are wide, so a 16:9 shot this tall needs ~3.5x as many columns.
const SHOT_HEIGHT = 20
const SHOT_WIDTH = Math.round(SHOT_HEIGHT * 3.5)

export function GameDetailView({ gameDetails, onBack }: GameDetailViewProps) {
  const turnDownService = new TurndownService()
  const boxRef = useRef<ScrollBoxRenderable | null>(null)

  const htmlToMarkdown = (content: string) => {
    return turnDownService.turndown(content)
  }

  const storeUrl = `https://store.steampowered.com/app/${gameDetails.appId}`

  useKeyboard((key) => {
    if (key.name === "q" || key.name === "esc") {
      onBack()
      return
    }
    const box = boxRef.current
    if (!box) return
    switch (key.name) {
      case "down":
      case "j":
        box.scrollBy({ x: 0, y: 2 })
        break
      case "up":
      case "k":
        box.scrollBy({ x: 0, y: -2 })
        break
      case "pagedown":
      case "space":
        box.scrollBy({ x: 0, y: box.viewport.height })
        break
      case "pageup":
        box.scrollBy({ x: 0, y: -box.viewport.height })
        break
      case "home":
        box.scrollTo({ x: 0, y: 0 })
        break
      case "end":
        box.scrollTo({ x: 0, y: box.scrollHeight })
        break
    }
  })

  return (
    <box style={{ width: "100%", height: "100%", flexDirection: "column", padding: 1 }}>
      <box onMouseDown={onBack}>
        <text style={{ fg: "#7aa2f7" }}>← Back to deals</text>
      </box>

      <scrollbox
        ref={boxRef}
        style={{ flexGrow: 1, marginTop: 1 }}
        viewportCulling={true}
        contentOptions={{ flexDirection: "column" }}
      >
        {/* <text style={{ fg: "#e0af68" }}>{gameDetails.name}</text> */}
        <ascii-font text={gameDetails.name} font="tiny" color="#7aa2f7" />

        <text style={{ marginTop: 1, fg: "#7aa2f7" }}>Steam page</text>
        <text>
          <a href={storeUrl} style={{ fg: "#9ece6a" }}>{storeUrl}</a>
        </text>

        <text style={{ marginTop: 1, fg: "#7aa2f7" }}>Developers</text>
        <text>{gameDetails.developers.join(", ")}</text>

        <text style={{ marginTop: 1, fg: "#7aa2f7" }}>Publishers</text>
        <text>{gameDetails.publishers.join(", ")}</text>

        <text style={{ marginTop: 1, fg: "#7aa2f7" }}>Platforms</text>
        <text>
          {[
            gameDetails.platforms.windows && "Windows",
            gameDetails.platforms.mac && "Mac",
            gameDetails.platforms.linux && "Linux",
          ]
            .filter(Boolean)
            .join(" · ")}
        </text>

        <text style={{ marginTop: 1, fg: "#7aa2f7" }}>Recommendations</text>
        <text>{gameDetails.totalRecommendations.toLocaleString()}</text>

        <text style={{ marginTop: 1, fg: "#7aa2f7" }}>Description</text>
        <markdown content={htmlToMarkdown(gameDetails.description)} conceal />

        {gameDetails.screenshots.length > 0 && (
          <text style={{ marginTop: 1, fg: "#7aa2f7" }}>
            Screenshots ({gameDetails.screenshots.length})
          </text>
        )}
        {gameDetails.screenshots.map((screenshot) => (
          <box
            key={screenshot}
            style={{
              width: "100%",
              maxWidth: SHOT_WIDTH,
              height: SHOT_HEIGHT,
              marginTop: 1,
              border: true,
              borderColor: "#565f89",
            }}
          >
            <image
              source={screenshot}
              style={{ width: "100%", height: "100%" }}
              fit="fit"
              protocol="auto"
            />
          </box>
        ))}
      </scrollbox>
    </box>
  );
}
