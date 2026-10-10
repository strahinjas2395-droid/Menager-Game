import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MainMenu from "@/app/page";
import NewCareerPage from "@/app/new-career/page";
import { GameMode } from "@/types";

const navigation = vi.hoisted(() => ({
  query: "mode=modern",
  push: vi.fn(),
  back: vi.fn(),
}));

const mockedStore = vi.hoisted(() => ({
  state: {
    init: vi.fn(),
    newCareer: vi.fn(),
    ready: true,
    saveExists: false,
    save: null as { gameMode?: "modern" | "iconic" } | null,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, back: navigation.back }),
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

vi.mock("@/store/gameStore", () => ({
  useGameStore: (selector: (state: typeof mockedStore.state) => unknown) => selector(mockedStore.state),
}));

// The app's Next.js transform injects the classic JSX runtime in Vitest.
(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("career database selection UI", () => {
  beforeEach(() => {
    navigation.query = "mode=modern";
    navigation.push.mockReset();
    navigation.back.mockReset();
    mockedStore.state.init.mockReset();
    mockedStore.state.newCareer.mockReset();
    mockedStore.state.save = null;
    mockedStore.state.saveExists = false;
    mockedStore.state.ready = true;
  });

  it("exposes both Current Era and special Iconic Prime modes on the main menu", () => {
    const html = renderToStaticMarkup(React.createElement(MainMenu));

    expect(html).toContain("Current Era");
    expect(html).toContain("Iconic Prime");
    expect(html).toContain("Special mode");
    expect(html).toContain("/new-career?mode=modern");
    expect(html).toContain("/new-career?mode=iconic");
  });

  it("labels Continue with the mode restored from the save", () => {
    mockedStore.state.save = { gameMode: GameMode.Modern };
    mockedStore.state.saveExists = true;

    expect(renderToStaticMarkup(React.createElement(MainMenu))).toContain("Continue Current Era");
  });

  it.each([
    ["mode=modern", "Current Era Career", "Contemporary database"],
    ["mode=iconic", "Iconic Prime Career", "Special database"],
  ])("shows the selected database throughout setup for %s", (query, heading, databaseLabel) => {
    navigation.query = query;
    const html = renderToStaticMarkup(React.createElement(NewCareerPage));

    expect(html).toContain(heading);
    expect(html).toContain(databaseLabel);
  });
});
