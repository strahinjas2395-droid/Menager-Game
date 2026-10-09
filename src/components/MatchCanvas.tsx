"use client";

/**
 * MatchCanvas — Phaser 3 pitch renderer embedded in React.
 * Draws the pitch (Session 13) plus player/ball dots with 100ms tweens
 * (Session 14). The scene instance is exposed through `sceneRef`.
 */
import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";

const PITCH_W = 1000;
const PITCH_H = 650;

export class MatchScene {
  private scene: import("phaser").Scene | null = null;
  private homeDots: import("phaser").GameObjects.Container[] = [];
  private awayDots: import("phaser").GameObjects.Container[] = [];
  private ball: import("phaser").GameObjects.Arc | null = null;
  private gameRef: import("phaser").Game | null = null;

  create(scene: import("phaser").Scene, colors: { home: string; away: string }, numbers: { home: number[]; away: number[] }): void {
    this.scene = scene;
    this.gameRef = scene.game;
    this.drawPitch(scene);

    this.homeDots = numbers.home.map((n, i) => this.makeDot(scene, colors.home, n, true, i));
    this.awayDots = numbers.away.map((n, i) => this.makeDot(scene, colors.away, n, false, i));

    this.ball = scene.add.circle(PITCH_W / 2, PITCH_H / 2, 4, 0xffffff).setDepth(10);
    this.ball.setStrokeStyle(1, 0x333333);
  }

  private makeDot(
    scene: import("phaser").Scene,
    color: string,
    number: number,
    filled: boolean,
    index: number,
  ): import("phaser").GameObjects.Container {
    const g = scene.add.graphics();
    const hex = parseInt(color.replace("#", ""), 16);
    if (filled) {
      g.fillStyle(hex, 1);
      g.fillCircle(0, 0, 8);
      g.lineStyle(2, 0xffffff, 0.9);
      g.strokeCircle(0, 0, 8);
    } else {
      g.fillStyle(0x000000, 0.35);
      g.fillCircle(0, 0, 8);
      g.lineStyle(3, hex, 1);
      g.strokeCircle(0, 0, 8);
    }
    const label = scene.add.text(0, 0, String(number), {
      fontFamily: "Arial, sans-serif",
      fontSize: "9px",
      color: filled ? "#ffffff" : color,
      fontStyle: "bold",
    });
    label.setOrigin(0.5);
    const c = scene.add.container(PITCH_W / 2, PITCH_H / 2, [g, label]);
    c.setDepth(5 + index * 0.01);
    return c;
  }

  private drawPitch(scene: import("phaser").Scene): void {
    const g = scene.add.graphics();

    // grass with mowing stripes
    g.fillStyle(0x2e7d32, 1);
    g.fillRect(0, 0, PITCH_W, PITCH_H);
    g.fillStyle(0x358838, 1);
    for (let i = 0; i < 10; i += 2) {
      g.fillRect((i * PITCH_W) / 10, 0, PITCH_W / 10, PITCH_H);
    }

    const line = 0xffffff;
    g.lineStyle(3, line, 0.6);

    // outline
    g.strokeRect(0, 0, PITCH_W, PITCH_H);
    // halfway line + centre circle
    g.lineBetween(PITCH_W / 2, 0, PITCH_W / 2, PITCH_H);
    g.strokeCircle(PITCH_W / 2, PITCH_H / 2, 91.5);
    g.fillStyle(line, 0.6);
    g.fillCircle(PITCH_W / 2, PITCH_H / 2, 4);

    // penalty boxes (165 deep, ±201), goal areas (55 deep, ±91)
    const boxY1 = PITCH_H / 2 - 201;
    const boxY2 = PITCH_H / 2 + 201;
    const gaY1 = PITCH_H / 2 - 91;
    const gaY2 = PITCH_H / 2 + 91;
    // left
    g.strokeRect(0, boxY1, 165, 402);
    g.strokeRect(0, gaY1, 55, 182);
    g.fillCircle(110, PITCH_H / 2, 4);
    g.arc(0, PITCH_H / 2, 91.5, -0.93, 0.93, false).strokePath();
    // right
    g.strokeRect(PITCH_W - 165, boxY1, 165, 402);
    g.strokeRect(PITCH_W - 55, gaY1, 55, 182);
    g.fillCircle(PITCH_W - 110, PITCH_H / 2, 4);
    g.arc(PITCH_W, PITCH_H / 2, 91.5, Math.PI - 0.93, Math.PI + 0.93, false).strokePath();

    // corner arcs
    g.arc(0, 0, 12, 0, Math.PI / 2, false).strokePath();
    g.arc(PITCH_W, 0, 12, Math.PI / 2, Math.PI, false).strokePath();
    g.arc(0, PITCH_H, 12, -Math.PI / 2, 0, false).strokePath();
    g.arc(PITCH_W, PITCH_H, 12, Math.PI, Math.PI * 1.5, false).strokePath();

    // goals (73 wide, 24 deep)
    g.fillStyle(0xffffff, 0.25);
    g.fillRect(-24, PITCH_H / 2 - 37, 24, 74);
    g.fillRect(PITCH_W, PITCH_H / 2 - 37, 24, 74);
    g.lineStyle(3, line, 0.85);
    g.strokeRect(-24, PITCH_H / 2 - 37, 24, 74);
    g.strokeRect(PITCH_W, PITCH_H / 2 - 37, 24, 74);
  }

  /** Smoothly tween all dots to their new positions (100ms). */
  updatePositions(
    home: { x: number; y: number }[],
    away: { x: number; y: number }[],
    ballPos: { x: number; y: number },
  ): void {
    if (!this.scene) return;
    const tween = (
      dot: import("phaser").GameObjects.Container,
      p: { x: number; y: number } | undefined,
    ) => {
      if (!p) return;
      const scene = this.scene!;
      scene.tweens.killTweensOf(dot);
      scene.tweens.add({
        targets: dot,
        x: p.x,
        y: p.y,
        duration: 100,
        ease: "Linear",
      });
    };
    home.forEach((p, i) => tween(this.homeDots[i], p));
    away.forEach((p, i) => tween(this.awayDots[i], p));
    if (this.ball) {
      const scene = this.scene;
      scene.tweens.killTweensOf(this.ball);
      scene.tweens.add({
        targets: this.ball,
        x: ballPos.x,
        y: ballPos.y,
        duration: 90,
        ease: "Linear",
      });
    }
  }

  destroy(): void {
    this.gameRef?.destroy(true);
    this.gameRef = null;
    this.scene = null;
    this.homeDots = [];
    this.awayDots = [];
    this.ball = null;
  }
}

interface MatchCanvasProps {
  sceneRef: MutableRefObject<MatchScene | null>;
  homeColor: string;
  awayColor: string;
  homeNumbers: number[];
  awayNumbers: number[];
}

export default function MatchCanvas({
  sceneRef,
  homeColor,
  awayColor,
  homeNumbers,
  awayNumbers,
}: MatchCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inited = useRef(false);

  useEffect(() => {
    if (inited.current || !containerRef.current) return;
    inited.current = true;

    let destroyed = false;
    let game: import("phaser").Game | null = null;

    import("phaser").then((Phaser) => {
      if (destroyed || !containerRef.current) return;

      class Scene extends Phaser.Scene {
        constructor() {
          super({ key: "match" });
        }
        create(): void {
          const ms = new MatchScene();
          sceneRef.current = ms;
          ms.create(
            this,
            { home: homeColor, away: awayColor },
            { home: homeNumbers, away: awayNumbers },
          );
        }
      }

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: PITCH_W,
        height: PITCH_H,
        backgroundColor: "#1f5c22",
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          width: PITCH_W,
          height: PITCH_H,
        },
        render: { antialias: true },
        scene: [Scene],
      });
    });

    return () => {
      destroyed = true;
      if (sceneRef.current) {
        // scene booted: MatchScene.destroy kills the Phaser.Game
        sceneRef.current.destroy();
        sceneRef.current = null;
      } else if (game) {
        // unmounted before the scene booted — kill the orphan game directly
        game.destroy(true);
      }
      game = null;
      inited.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="aspect-[1000/650] w-full overflow-hidden rounded-lg border border-white/10"
      style={{ background: "#1f5c22" }}
    />
  );
}
