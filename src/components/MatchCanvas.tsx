"use client";

/**
 * MatchCanvas — Phaser 3 pitch renderer embedded in React.
 * Renders at 2× resolution so lines and dots stay crisp when the canvas is
 * scaled down to the viewport. The view is wider than the playing surface:
 * that exterior space is where the two goals physically belong.
 */
import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";

const PITCH_W = 1000;
const PITCH_H = 650;
const GOAL_DEPTH = 24;
const OUTER_MARGIN_X = 32;
const VIEW_W = PITCH_W + OUTER_MARGIN_X * 2;
/** render scale: all drawing happens at R× the logical view size */
const R = 2;

/** Exported geometry keeps the field/goal relationship explicit and testable. */
export const MATCH_PITCH_VIEW = Object.freeze({
  viewWidth: VIEW_W,
  pitchLeft: OUTER_MARGIN_X,
  pitchRight: OUTER_MARGIN_X + PITCH_W,
  leftGoalBack: OUTER_MARGIN_X - GOAL_DEPTH,
  rightGoalBack: OUTER_MARGIN_X + PITCH_W + GOAL_DEPTH,
  goalDepth: GOAL_DEPTH,
});

/** Logical radii: 10 pitch units are approximately one metre. */
export const MATCH_MARKER_GEOMETRY = Object.freeze({
  playerRadius: 6,
  ballRadius: 3.5,
  playerDiameterMetres: 1.2,
  ballDiameterMetres: 0.7,
});

const renderX = (pitchX: number) => (pitchX + OUTER_MARGIN_X) * R;

export class MatchScene {
  private scene: import("phaser").Scene | null = null;
  private homeDots: import("phaser").GameObjects.Container[] = [];
  private awayDots: import("phaser").GameObjects.Container[] = [];
  private ball: import("phaser").GameObjects.Arc | null = null;
  private ballShadow: import("phaser").GameObjects.Ellipse | null = null;
  private airBadge: import("phaser").GameObjects.Text | null = null;
  private goalFx: import("phaser").GameObjects.GameObject[] = [];
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
      .ellipse(renderX(PITCH_W / 2), (PITCH_H / 2) * R + 4, 17, 8, 0x000000, 0.34)
      .setDepth(9);
    this.ball = scene.add
      .circle(
        renderX(PITCH_W / 2),
        (PITCH_H / 2) * R,
        MATCH_MARKER_GEOMETRY.ballRadius * R,
        0xffffff,
      )
      .setDepth(11);
    this.ball.setStrokeStyle(2, 0x222222, 0.9);
    this.airBadge = scene.add.text(renderX(PITCH_W / 2), (PITCH_H / 2) * R - 22, "AIR", {
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: "14px",
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
    // About 1.2 m in simulation scale: readable shirt numbers without making
    // each player occupy a several-metre-wide chunk of the pitch.
    const rad = MATCH_MARKER_GEOMETRY.playerRadius * R;
    if (filled) {
      // soft drop shadow
      g.fillStyle(0x000000, 0.35);
      g.fillCircle(3, 4, rad);
      g.fillStyle(hex, 1);
      g.fillCircle(0, 0, rad);
      g.lineStyle(2, 0xffffff, 0.95);
      g.strokeCircle(0, 0, rad);
    } else {
      g.fillStyle(0x101828, 0.9);
      g.fillCircle(0, 0, rad);
      g.lineStyle(3, hex, 1);
      g.strokeCircle(0, 0, rad);
      g.lineStyle(1, 0xffffff, 0.5);
      g.strokeCircle(0, 0, rad - 3);
    }
    const label = scene.add.text(0, filled ? -1 : 0, String(number), {
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: "13px",
      color: "#ffffff",
      fontStyle: "bold",
      stroke: filled ? "#000000" : color,
      strokeThickness: 2,
    });
    label.setOrigin(0.5);
    const c = scene.add.container(renderX(PITCH_W / 2), (PITCH_H / 2) * R, [g, label]);
    c.setDepth(5 + index * 0.01);
    return c;
  }

  private drawPitch(scene: import("phaser").Scene): void {
    const g = scene.add.graphics();
    const W = VIEW_W * R;
    const H = PITCH_H * R;
    const pitchLeft = renderX(0);
    const pitchRight = renderX(PITCH_W);
    const pitchWidth = PITCH_W * R;
    const leftLine = pitchLeft + 3;
    const rightLine = pitchRight - 3;
    const s = (n: number) => n * R; // logical → render units

    // The canvas exterior is deliberately not grass: the goal frames and nets
    // sit in this run-off area, behind (never inside) the two goal lines.
    g.fillStyle(0x102d18, 1);
    g.fillRect(0, 0, W, H);
    g.fillStyle(0x2e7d32, 1);
    g.fillRect(pitchLeft, 0, pitchWidth, H);
    g.fillStyle(0x327f35, 1);
    for (let i = 0; i < 10; i += 2) {
      g.fillRect(pitchLeft + (i * pitchWidth) / 10, 0, pitchWidth / 10, H);
    }

    const line = 0xffffff;
    g.lineStyle(6, line, 0.9);

    // Playing-surface outline. Engine x=0/1000 maps to these goal lines.
    g.strokeRect(leftLine, 3, pitchWidth - 6, H - 6);
    // halfway line + centre circle
    g.lineBetween(renderX(500), 3, renderX(500), H - 3);
    g.beginPath();
    g.arc(renderX(500), s(325), s(91.5), 0, Math.PI * 2, false);
    g.strokePath();
    g.fillStyle(line, 0.95);
    g.fillCircle(renderX(500), s(325), 5);

    // penalty boxes (165 deep, ±201), goal areas (55 deep, ±91)
    const boxY1 = s(325 - 201);
    const boxH = s(402);
    const gaY1 = s(325 - 91);
    const gaH = s(182);
    // left box
    g.strokeRect(leftLine, boxY1, s(165), boxH);
    g.strokeRect(leftLine, gaY1, s(55), gaH);
    g.fillCircle(renderX(110), s(325), 5);
    g.beginPath();
    g.arc(leftLine, s(325), s(91.5), -0.93, 0.93, false);
    g.strokePath();
    // right box
    g.strokeRect(rightLine - s(165), boxY1, s(165), boxH);
    g.strokeRect(rightLine - s(55), gaY1, s(55), gaH);
    g.fillCircle(renderX(PITCH_W - 110), s(325), 5);
    g.beginPath();
    g.arc(rightLine, s(325), s(91.5), Math.PI - 0.93, Math.PI + 0.93, false);
    g.strokePath();

    // corner arcs — each in its own path so strokes never accumulate
    const corner = (x: number, y: number, a0: number, a1: number) => {
      g.beginPath();
      g.arc(x, y, s(12), a0, a1, false);
      g.strokePath();
    };
    corner(leftLine, 3, 0, Math.PI / 2);
    corner(rightLine, 3, Math.PI / 2, Math.PI);
    corner(leftLine, H - 3, -Math.PI / 2, 0);
    corner(rightLine, H - 3, Math.PI, Math.PI * 1.5);

    // Goal mouths share the goal-line plane, while every centimetre of net is
    // in the exterior margin: left extends left, right extends right.
    const goalY = s(325 - 37);
    const goalH = s(74);
    const goalD = s(GOAL_DEPTH);
    const leftBack = leftLine - goalD;
    const rightBack = rightLine + goalD;
    g.fillStyle(0xffffff, 0.13);
    g.fillRect(leftBack, goalY, goalD, goalH);
    g.fillRect(rightLine, goalY, goalD, goalH);
    g.lineStyle(6, line, 0.96);
    g.strokeRect(leftBack, goalY, goalD, goalH);
    g.strokeRect(rightLine, goalY, goalD, goalH);
    // net mesh
    g.lineStyle(2, line, 0.34);
    for (let n = 1; n < 4; n++) {
      const gy = goalY + (goalH * n) / 4;
      g.lineBetween(leftBack, gy, leftLine, gy);
      g.lineBetween(rightLine, gy, rightBack, gy);
    }
    for (let n = 1; n < 3; n++) {
      g.lineBetween(leftBack + (goalD * n) / 3, goalY, leftBack + (goalD * n) / 3, goalY + goalH);
      g.lineBetween(rightLine + (goalD * n) / 3, goalY, rightLine + (goalD * n) / 3, goalY + goalH);
    }
  }

  private finishGoalFx(object: import("phaser").GameObjects.GameObject): void {
    this.goalFx = this.goalFx.filter((candidate) => candidate !== object);
    object.destroy();
  }

  /** Flash and ripple the net that was scored into. React supplies the large
   * score banner; this effect keeps the goal itself visibly involved. */
  playGoalAnimation(scoringSide: "home" | "away"): void {
    const scene = this.scene;
    if (!scene) return;

    this.goalFx.forEach((object) => {
      scene.tweens.killTweensOf(object);
      object.destroy();
    });
    this.goalFx = [];

    const goalLineX = scoringSide === "home" ? renderX(PITCH_W) - 3 : renderX(0) + 3;
    const direction = scoringSide === "home" ? 1 : -1;
    const centreX = goalLineX + direction * GOAL_DEPTH * R * 0.5;
    const centreY = (PITCH_H / 2) * R;
    const glow = scene.add
      .rectangle(centreX, centreY, GOAL_DEPTH * R, 82 * R, 0xf0a500, 0.48)
      .setDepth(18);
    this.goalFx.push(glow);
    scene.tweens.add({
      targets: glow,
      alpha: 0,
      scaleX: 1.45,
      duration: 950,
      ease: "Cubic.Out",
      onComplete: () => this.finishGoalFx(glow),
    });

    for (let i = 0; i < 3; i++) {
      const ring = scene.add
        .circle(centreX, centreY, 18 + i * 7, 0xf0a500, 0)
        .setStrokeStyle(5 - i, i === 1 ? 0xffffff : 0xf0a500, 0.9)
        .setDepth(19);
      this.goalFx.push(ring);
      scene.tweens.add({
        targets: ring,
        alpha: 0,
        scaleX: 3.4 + i * 0.45,
        scaleY: 3.4 + i * 0.45,
        duration: 700 + i * 180,
        delay: i * 70,
        ease: "Cubic.Out",
        onComplete: () => this.finishGoalFx(ring),
      });
    }

    const reducedMotion = typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!reducedMotion) {
      scene.cameras.main.flash(170, 240, 165, 0, false);
      scene.cameras.main.shake(280, 0.0035);
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
        x: renderX(p.x),
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
        x: renderX(ballPos.x),
        y: ballPos.y * R - lift,
        scaleX: scale,
        scaleY: scale,
        duration: 90,
        ease: "Linear",
      });
      this.ball.setStrokeStyle(2, ballPos.airborne ? 0xf0a500 : 0x222222, 0.95);
      if (this.ballShadow) {
        scene.tweens.killTweensOf(this.ballShadow);
        scene.tweens.add({
          targets: this.ballShadow,
          x: renderX(ballPos.x),
          y: ballPos.y * R + 5,
          alpha: Math.max(0.1, 0.34 - height / 280),
          scaleX: 1 + Math.min(0.7, height / 90),
          duration: 90,
          ease: "Linear",
        });
      }
      if (this.airBadge) {
        this.airBadge.setVisible(Boolean(ballPos.airborne));
        this.airBadge.setPosition(renderX(ballPos.x), ballPos.y * R - lift - 21);
      }
    }
  }

  destroy(): void {
    this.goalFx = [];
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
        width: VIEW_W * R,
        height: PITCH_H * R,
        backgroundColor: "#102d18",
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          width: VIEW_W * R,
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
