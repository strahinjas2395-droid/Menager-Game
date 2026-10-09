"use client";

/**
 * MatchCanvas — Phaser 3 pitch renderer embedded in React.
 * Renders at 2× resolution (2000×1300 backing store) so lines and dots stay
 * crisp when the canvas is scaled down to the viewport.
 */
import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";

const PITCH_W = 1000;
const PITCH_H = 650;
/** render scale: all drawing happens at R× the logical pitch size */
const R = 2;

export class MatchScene {
  private scene: import("phaser").Scene | null = null;
  private homeDots: import("phaser").GameObjects.Container[] = [];
  private awayDots: import("phaser").GameObjects.Container[] = [];
  private ball: import("phaser").GameObjects.Arc | null = null;
  private ballShadow: import("phaser").GameObjects.Ellipse | null = null;
  private airBadge: import("phaser").GameObjects.Text | null = null;
  private gameRef: import("phaser").Game | null = null;

  create(
    scene: import("phaser").Scene,
    colors: { home: string; away: string },
    numbers: { home: number[]; away: number[] },
  ): void {
    this.scene = scene;
    this.gameRef = scene.game;
    this.drawPitch(scene);

    this.homeDots = numbers.home.map((n, i) => this.makeDot(scene, colors.home, n, true, i));
    this.awayDots = numbers.away.map((n, i) => this.makeDot(scene, colors.away, n, false, i));

    this.ballShadow = scene.add
      .ellipse((PITCH_W / 2) * R, (PITCH_H / 2) * R + 5, 25, 12, 0x000000, 0.34)
      .setDepth(9);
    this.ball = scene.add
      .circle((PITCH_W / 2) * R, (PITCH_H / 2) * R, 11, 0xffffff)
      .setDepth(11);
    this.ball.setStrokeStyle(3, 0x222222, 0.9);
    this.airBadge = scene.add.text((PITCH_W / 2) * R, (PITCH_H / 2) * R - 28, "AIR", {
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: "18px",
      color: "#ffd166",
      fontStyle: "bold",
      stroke: "#111827",
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(12).setVisible(false);
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
    const rad = 19;
    if (filled) {
      // soft drop shadow
      g.fillStyle(0x000000, 0.35);
      g.fillCircle(3, 4, rad);
      g.fillStyle(hex, 1);
      g.fillCircle(0, 0, rad);
      g.lineStyle(4, 0xffffff, 0.95);
      g.strokeCircle(0, 0, rad);
    } else {
      g.fillStyle(0x101828, 0.9);
      g.fillCircle(0, 0, rad);
      g.lineStyle(5, hex, 1);
      g.strokeCircle(0, 0, rad);
      g.lineStyle(2, 0xffffff, 0.5);
      g.strokeCircle(0, 0, rad - 4);
    }
    const label = scene.add.text(0, filled ? -1 : 0, String(number), {
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: "20px",
      color: "#ffffff",
      fontStyle: "bold",
      stroke: filled ? "#000000" : color,
      strokeThickness: filled ? 3 : 4,
    });
    label.setOrigin(0.5);
    const c = scene.add.container((PITCH_W / 2) * R, (PITCH_H / 2) * R, [g, label]);
    c.setDepth(5 + index * 0.01);
    return c;
  }

  private drawPitch(scene: import("phaser").Scene): void {
    const g = scene.add.graphics();
    const W = PITCH_W * R;
    const H = PITCH_H * R;
    const s = (n: number) => n * R; // logical → render units

    // grass with subtle mowing stripes
    g.fillStyle(0x2e7d32, 1);
    g.fillRect(0, 0, W, H);
    g.fillStyle(0x327f35, 1);
    for (let i = 0; i < 10; i += 2) {
      g.fillRect((i * W) / 10, 0, W / 10, H);
    }

    const line = 0xffffff;
    g.lineStyle(6, line, 0.9);

    // outline
    g.strokeRect(3, 3, W - 6, H - 6);
    // halfway line + centre circle
    g.lineBetween(s(500), 3, s(500), H - 3);
    g.beginPath();
    g.arc(s(500), s(325), s(91.5), 0, Math.PI * 2, false);
    g.strokePath();
    g.fillStyle(line, 0.95);
    g.fillCircle(s(500), s(325), 5);

    // penalty boxes (165 deep, ±201), goal areas (55 deep, ±91)
    const boxY1 = s(325 - 201);
    const boxH = s(402);
    const gaY1 = s(325 - 91);
    const gaH = s(182);
    // left box
    g.strokeRect(3, boxY1, s(165), boxH);
    g.strokeRect(3, gaY1, s(55), gaH);
    g.fillCircle(s(110), s(325), 5);
    g.beginPath();
    g.arc(3, s(325), s(91.5), -0.93, 0.93, false);
    g.strokePath();
    // right box
    g.strokeRect(W - s(165) - 3, boxY1, s(165), boxH);
    g.strokeRect(W - s(55) - 3, gaY1, s(55), gaH);
    g.fillCircle(W - s(110), s(325), 5);
    g.beginPath();
    g.arc(W - 3, s(325), s(91.5), Math.PI - 0.93, Math.PI + 0.93, false);
    g.strokePath();

    // corner arcs — each in its own path so strokes never accumulate
    const corner = (x: number, y: number, a0: number, a1: number) => {
      g.beginPath();
      g.arc(x, y, s(12), a0, a1, false);
      g.strokePath();
    };
    corner(3, 3, 0, Math.PI / 2);
    corner(W - 3, 3, Math.PI / 2, Math.PI);
    corner(3, H - 3, -Math.PI / 2, 0);
    corner(W - 3, H - 3, Math.PI, Math.PI * 1.5);

    // Goals/nets are drawn just inside the goal line. The earlier renderer
    // placed them outside the canvas, where browser clipping made them vanish.
    const goalY = s(325 - 37);
    const goalH = s(74);
    const goalD = s(24);
    g.fillStyle(0xffffff, 0.13);
    g.fillRect(3, goalY, goalD, goalH);
    g.fillRect(W - goalD - 3, goalY, goalD, goalH);
    g.lineStyle(6, line, 0.96);
    g.strokeRect(3, goalY, goalD, goalH);
    g.strokeRect(W - goalD - 3, goalY, goalD, goalH);
    // net mesh
    g.lineStyle(2, line, 0.34);
    for (let n = 1; n < 4; n++) {
      const gy = goalY + (goalH * n) / 4;
      g.lineBetween(3, gy, goalD + 3, gy);
      g.lineBetween(W - goalD - 3, gy, W - 3, gy);
    }
    for (let n = 1; n < 3; n++) {
      g.lineBetween(3 + (goalD * n) / 3, goalY, 3 + (goalD * n) / 3, goalY + goalH);
      g.lineBetween(W - goalD - 3 + (goalD * n) / 3, goalY, W - goalD - 3 + (goalD * n) / 3, goalY + goalH);
    }
  }

  /** Smoothly tween all dots to their new positions (100ms). */
  updatePositions(
    home: { x: number; y: number }[],
    away: { x: number; y: number }[],
    ballPos: { x: number; y: number; height?: number; airborne?: boolean },
  ): void {
    if (!this.scene) return;
    const tween = (
      dot: import("phaser").GameObjects.Container | undefined,
      p: { x: number; y: number } | undefined,
    ) => {
      if (!p || !dot) return;
      const scene = this.scene!;
      scene.tweens.killTweensOf(dot);
      scene.tweens.add({
        targets: dot,
        x: p.x * R,
        y: p.y * R,
        duration: 100,
        ease: "Linear",
      });
    };
    home.forEach((p, i) => tween(this.homeDots[i], p));
    away.forEach((p, i) => tween(this.awayDots[i], p));
    if (this.ball) {
      const scene = this.scene;
      const height = Math.max(0, ballPos.height ?? 0);
      const lift = Math.min(58, height * R * 0.42);
      const scale = 1 + Math.min(0.38, height / 170);
      scene.tweens.killTweensOf(this.ball);
      scene.tweens.add({
        targets: this.ball,
        x: ballPos.x * R,
        y: ballPos.y * R - lift,
        scaleX: scale,
        scaleY: scale,
        duration: 90,
        ease: "Linear",
      });
      this.ball.setStrokeStyle(3, ballPos.airborne ? 0xf0a500 : 0x222222, 0.95);
      if (this.ballShadow) {
        scene.tweens.killTweensOf(this.ballShadow);
        scene.tweens.add({
          targets: this.ballShadow,
          x: ballPos.x * R,
          y: ballPos.y * R + 5,
          alpha: Math.max(0.1, 0.34 - height / 280),
          scaleX: 1 + Math.min(0.7, height / 90),
          duration: 90,
          ease: "Linear",
        });
      }
      if (this.airBadge) {
        this.airBadge.setVisible(Boolean(ballPos.airborne));
        this.airBadge.setPosition(ballPos.x * R, ballPos.y * R - lift - 28);
      }
    }
  }

  destroy(): void {
    this.gameRef?.destroy(true);
    this.gameRef = null;
    this.scene = null;
    this.homeDots = [];
    this.awayDots = [];
    this.ball = null;
    this.ballShadow = null;
    this.airBadge = null;
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
    let resizeObserver: ResizeObserver | null = null;

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
        width: PITCH_W * R,
        height: PITCH_H * R,
        backgroundColor: "#1f5c22",
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          width: PITCH_W * R,
          height: PITCH_H * R,
        },
        render: { antialias: true, antialiasGL: true },
        scene: [Scene],
      });
      resizeObserver = new ResizeObserver(() => game?.scale.refresh());
      resizeObserver.observe(containerRef.current);
    });

    return () => {
      destroyed = true;
      resizeObserver?.disconnect();
      resizeObserver = null;
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
      className="match-canvas flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-lg border border-white/10"
      style={{ background: "#102d18" }}
    />
  );
}
