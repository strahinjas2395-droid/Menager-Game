import type { TacticalDirectives } from "@/types";

export type InstructionCategory =
  | "Movement"
  | "Possession"
  | "Passing"
  | "Final third"
  | "Defending"
  | "Transitions"
  | "Goalkeeping"
  | "Set pieces";

export type InstructionScope = "team" | "player" | "both";

export interface BooleanInstructionDefinition {
  key: keyof TacticalDirectives;
  label: string;
  category: InstructionCategory;
  scope: InstructionScope;
  description: string;
  onDescription: string;
  offDescription: string;
  positions?: readonly string[];
}

export interface ChoiceInstructionOption {
  value: string;
  label: string;
  description: string;
}

export interface ChoiceInstructionDefinition {
  key: keyof TacticalDirectives;
  label: string;
  category: InstructionCategory;
  scope: InstructionScope;
  description: string;
  options: readonly ChoiceInstructionOption[];
  positions?: readonly string[];
}

/**
 * Every boolean in the executable directive contract. `undefined` means inherit
 * from role/team; false is a deliberate instruction and therefore must persist.
 */
export const BOOLEAN_INSTRUCTIONS = [
  { key: "holdPosition", label: "Hold position", category: "Movement", scope: "both", description: "Keep the assigned zone instead of following play.", onDescription: "Hold the assigned position and preserve the team's structure.", offDescription: "Leave the assigned position when a useful movement appears." },
  { key: "forwardRuns", label: "Get further forward", category: "Movement", scope: "both", description: "Attack beyond the ball more often.", onDescription: "Make aggressive forward runs beyond the ball and defensive line.", offDescription: "Do not make aggressive forward runs beyond the ball." },
  { key: "roam", label: "Roam from position", category: "Movement", scope: "both", description: "Find space outside the nominal zone.", onDescription: "Roam freely away from the nominal position to find useful space.", offDescription: "Stay within the nominal positional lane rather than roaming." },
  { key: "stayWide", label: "Stay wider", category: "Movement", scope: "both", description: "Stretch the pitch near the touchline.", onDescription: "Stay very wide and stretch play close to the touchline.", offDescription: "Do not hold a wide touchline position." },
  { key: "cutInside", label: "Cut inside", category: "Movement", scope: "both", description: "Move from a flank toward the half-space or centre.", onDescription: "Cut inside from a wide position toward central attacking space.", offDescription: "Do not cut inside from the flank." },
  { key: "defensiveDuty", label: "Defend with the team", category: "Defending", scope: "both", description: "Recover behind the ball regardless of attacking role.", onDescription: "Recover fully and take a genuine defensive assignment when possession is lost.", offDescription: "Do not add an extra defensive assignment beyond the normal role." },
  { key: "playOneTwos", label: "Play one-twos", category: "Possession", scope: "both", description: "Pass and immediately move for the return.", onDescription: "Play give-and-go one-twos and sprint for the return pass.", offDescription: "Do not seek give-and-go one-two combinations." },
  { key: "thirdManRuns", label: "Use third-man runs", category: "Movement", scope: "both", description: "Run beyond while two teammates combine.", onDescription: "Make third-man runs beyond a short passing combination.", offDescription: "Do not make dedicated third-man runs." },
  { key: "makeDecoyRuns", label: "Make decoy runs", category: "Movement", scope: "both", description: "Drag markers away without demanding the ball.", onDescription: "Make decoy runs that drag a defender away from the ball carrier.", offDescription: "Do not leave position merely to make a decoy run." },
  { key: "dropBetweenDefenders", label: "Drop between defenders", category: "Movement", scope: "player", description: "Form a temporary back three during build-up.", onDescription: "Drop between the centre backs to receive and build from deep.", offDescription: "Do not drop into the defensive line during build-up." },
  { key: "swapPositions", label: "Swap positions", category: "Movement", scope: "both", description: "Rotate lanes with a nearby teammate.", onDescription: "Regularly interchange and swap positional lanes with a nearby teammate.", offDescription: "Keep the normal lane instead of swapping positions." },
  { key: "shieldBall", label: "Shield the ball", category: "Possession", scope: "both", description: "Use the body and wait for support under pressure.", onDescription: "Shield and protect the ball with the body when a defender closes.", offDescription: "Release or carry the ball rather than deliberately shielding it." },
  { key: "knockBallPastOpponent", label: "Knock it past opponents", category: "Possession", scope: "both", description: "Push the ball into space and race the defender.", onDescription: "Knock the ball beyond a defender into open space and use pace to chase it.", offDescription: "Keep the ball close instead of knocking it beyond opponents." },
  { key: "dribbleMore", label: "Dribble more", category: "Possession", scope: "both", description: "Attempt take-ons and progressive carries more often.", onDescription: "Dribble at opponents and carry the ball forward more often.", offDescription: "Do not increase dribble and take-on attempts." },
  { key: "dribbleLess", label: "Dribble less", category: "Possession", scope: "both", description: "Release the ball rather than taking players on.", onDescription: "Dribble less and release the ball quickly instead of taking on opponents.", offDescription: "Do not suppress useful dribbles and carries." },
  { key: "riskyPasses", label: "Take more passing risks", category: "Passing", scope: "both", description: "Try difficult line-breaking and through passes.", onDescription: "Attempt risky creative passes and through balls that can break defensive lines.", offDescription: "Avoid speculative creative passes and dangerous turnovers." },
  { key: "shortPassing", label: "Shorter passing", category: "Passing", scope: "both", description: "Prefer nearby feet and combinations.", onDescription: "Prefer short passes to nearby teammates and compact combinations.", offDescription: "Do not restrict passing to short nearby options." },
  { key: "directPassing", label: "More direct passing", category: "Passing", scope: "both", description: "Look farther forward earlier.", onDescription: "Play longer and more direct forward passes earlier.", offDescription: "Do not force long direct passes when shorter options exist." },
  { key: "switchPlay", label: "Switch the play", category: "Passing", scope: "both", description: "Find the opposite flank when it is open.", onDescription: "Look for long diagonal switches to the opposite side of the pitch.", offDescription: "Do not prioritise diagonal switches of play." },
  { key: "targetMan", label: "Hold up the ball", category: "Possession", scope: "both", description: "Receive under contact and bring runners into play.", onDescription: "Act as a target, hold the ball up and bring supporting runners into play.", offDescription: "Do not act as a stationary target for hold-up play." },
  { key: "earlyCross", label: "Cross early", category: "Final third", scope: "both", description: "Deliver before reaching the byline.", onDescription: "Deliver crosses early before reaching the byline.", offDescription: "Do not cross early; carry closer or combine first." },
  { key: "cutbacks", label: "Look for cutbacks", category: "Final third", scope: "both", description: "Reach the byline and pull the ball back.", onDescription: "Reach the byline and cut the ball back toward a late runner.", offDescription: "Do not prioritise byline cutback passes." },
  { key: "shootFromDistance", label: "Shoot from distance", category: "Final third", scope: "both", description: "Attempt more long-range shots.", onDescription: "Shoot from long range when a sight of goal appears.", offDescription: "Do not attempt speculative shots from long distance." },
  { key: "avoidShooting", label: "Shoot less often", category: "Final third", scope: "both", description: "Prefer a pass unless the chance is very strong.", onDescription: "Avoid shooting except for clear high-quality chances.", offDescription: "Take normal shooting opportunities rather than always passing." },
  { key: "attackRebounds", label: "Attack rebounds", category: "Final third", scope: "both", description: "Follow shots for spills and second balls.", onDescription: "Attack goalkeeper spills, blocked shots and rebounds inside the box.", offDescription: "Hold normal position instead of gambling for rebounds." },
  { key: "clearImmediately", label: "Clear danger", category: "Defending", scope: "both", description: "Clear first-time rather than build under danger.", onDescription: "Clear the ball immediately from dangerous defensive areas.", offDescription: "Try to retain and build rather than clearing automatically." },
  { key: "tightMarking", label: "Mark tightly", category: "Defending", scope: "both", description: "Stay touch-tight to the assigned opponent.", onDescription: "Mark the nearest dangerous opponent tightly and deny space to receive.", offDescription: "Use normal zonal distance rather than tight marking." },
  { key: "pressHard", label: "Press more", category: "Defending", scope: "both", description: "Close the ball earlier and more intensely.", onDescription: "Join the aggressive press and close down the ball carrier quickly.", offDescription: "Do not join the aggressive press; protect shape instead." },
  { key: "pressLess", label: "Press less", category: "Defending", scope: "both", description: "Stay in the block rather than charging out.", onDescription: "Press less, stand off and preserve the defensive block.", offDescription: "Do not stand off; apply the normal pressing demand." },
  { key: "screenPassingLanes", label: "Screen passing lanes", category: "Defending", scope: "both", description: "Guard the route into a dangerous receiver.", onDescription: "Screen and block the passing lane into dangerous central receivers.", offDescription: "Do not prioritise screening a passing lane over normal positioning." },
  { key: "blockCrosses", label: "Block crosses", category: "Defending", scope: "both", description: "Close wide carriers and protect the delivery lane.", onDescription: "Close wide ball carriers quickly and physically block crosses.", offDescription: "Protect the normal zone rather than jumping out specifically to block crosses." },
  { key: "blockShots", label: "Block shots", category: "Defending", scope: "both", description: "Get into the path between ball and goal.", onDescription: "Step into the shooting lane and commit the body to block shots.", offDescription: "Do not leave the normal assignment solely to block a shot." },
  { key: "preventShortGKDistribution", label: "Stop short goalkeeper distribution", category: "Defending", scope: "both", description: "Mark nearby defenders on goal kicks.", onDescription: "Prevent the opposing goalkeeper distributing short to defenders.", offDescription: "Allow the opposing goalkeeper's short options and retain shape." },
  { key: "conserveEnergy", label: "Ease off", category: "Transitions", scope: "both", description: "Reduce repeated sprints and preserve condition.", onDescription: "Conserve energy by avoiding unnecessary sprints and repeated presses.", offDescription: "Use normal energy and sprint when the situation demands it." },
  { key: "restDefense", label: "Stay in rest defence", category: "Transitions", scope: "both", description: "Remain behind attacks to stop counters.", onDescription: "Stay behind the ball in rest defence while teammates attack.", offDescription: "Join attacks normally instead of remaining in rest defence." },
  { key: "counterOutlet", label: "Be the counter outlet", category: "Transitions", scope: "both", description: "Remain available ahead of the block for regains.", onDescription: "Stay available as the high outlet for counterattacks after a regain.", offDescription: "Recover with the team instead of remaining as a counter outlet." },
] as const satisfies readonly BooleanInstructionDefinition[];

export type BooleanDirectiveKey = (typeof BOOLEAN_INSTRUCTIONS)[number]["key"];

const option = (value: string, label: string, description: string): ChoiceInstructionOption => ({ value, label, description });

/** Mutually exclusive choices. Selecting “inherit” in the UI removes the key. */
export const CHOICE_INSTRUCTIONS = [
  { key: "supportRun", label: "Support movement", category: "Movement", scope: "both", description: "Where to move when a teammate has the ball.", options: [option("balanced", "Balanced", "Offer a situational supporting angle."), option("comeShort", "Come short", "Move toward the ball to offer a safe feet option."), option("runInBehind", "Run in behind", "Sprint beyond the defensive line into space."), option("moveIntoChannels", "Move into channels", "Attack the gaps between full-back and centre-back.")] },
  { key: "flankRun", label: "Flank relationship", category: "Movement", scope: "both", description: "How to run around a teammate on the flank.", options: [option("balanced", "Balanced", "Choose the useful flank run for the situation."), option("overlap", "Overlap", "Run outside the wide teammate toward the touchline."), option("underlap", "Underlap", "Run inside the wide teammate through the half-space.")] },
  { key: "carryPath", label: "Carry direction", category: "Possession", scope: "both", description: "Preferred path when advancing with the ball.", options: [option("balanced", "Balanced", "Carry toward whichever route has space."), option("inside", "Drive inside", "Carry diagonally toward central goal-facing space."), option("outside", "Drive outside", "Carry away from congestion toward the outside lane."), option("downLine", "Run down the line", "Carry vertically along the touchline toward the byline.")] },
  { key: "receiveMode", label: "First touch", category: "Possession", scope: "both", description: "What to do as a pass arrives.", options: [option("secure", "Secure it", "Cushion the ball safely and protect possession."), option("turn", "Turn forward", "Use the first touch to face and attack forward."), option("oneTouch", "Play one-touch", "Release the next pass or shot with minimal control time.")] },
  { key: "passingRisk", label: "Passing risk", category: "Passing", scope: "both", description: "Tolerance for difficult, high-reward passes.", options: [option("safe", "Safer", "Protect possession and avoid crowded lanes."), option("balanced", "Balanced", "Match pass risk to the football situation."), option("creative", "Creative", "Attempt ambitious line-breaking and chance-creating passes.")] },
  { key: "passTarget", label: "Pass destination", category: "Passing", scope: "both", description: "Play to feet or lead runs into space.", options: [option("feet", "To feet", "Pass accurately to the receiver's current feet."), option("mixed", "Mixed", "Choose feet or space from the receiver's movement."), option("space", "Into space", "Lead teammates into open grass ahead of them.")] },
  { key: "progression", label: "Progression", category: "Passing", scope: "both", description: "Whether to recycle or advance vertically.", options: [option("recycle", "Recycle", "Turn away from pressure and circulate safely."), option("balanced", "Balanced", "Advance when open and recycle when blocked."), option("vertical", "Vertical", "Break lines and move the ball toward goal quickly.")] },
  { key: "buildUpStyle", label: "Build-up route", category: "Passing", scope: "both", description: "How the side leaves its defensive third.", options: [option("playOut", "Play out", "Use goalkeeper and defenders in patient short build-up."), option("mixed", "Mixed", "Choose a short or direct exit according to pressure."), option("bypassPress", "Bypass the press", "Play beyond the first pressure line quickly.")] },
  { key: "attackingFocus", label: "Attacking focus", category: "Passing", scope: "both", description: "The lane the team should seek most often.", options: [option("left", "Left", "Progress through the team's left flank."), option("centre", "Centre", "Progress through central lanes and the half-spaces."), option("right", "Right", "Progress through the team's right flank."), option("bothFlanks", "Both flanks", "Move play toward either touchline and stretch the block."), option("balanced", "Balanced", "Use whichever lane is open.")] },
  { key: "crossFrequency", label: "Cross frequency", category: "Final third", scope: "both", description: "How readily to deliver from wide areas.", options: [option("never", "Rarely", "Keep or combine rather than crossing."), option("balanced", "Balanced", "Cross when the delivery and targets are suitable."), option("often", "Often", "Deliver quickly whenever a useful crossing lane opens.")] },
  { key: "crossType", label: "Cross shape", category: "Final third", scope: "both", description: "Trajectory and pace of delivery.", options: [option("low", "Low", "Fire a low cross through the six-yard area."), option("whipped", "Whipped", "Bend a fast cross between goalkeeper and defenders."), option("floated", "Floated", "Hang a high cross for an aerial challenge.")] },
  { key: "crossAim", label: "Cross target", category: "Final third", scope: "both", description: "The intended arrival zone in the box.", options: [option("nearPost", "Near post", "Attack the space at the front post."), option("centre", "Centre", "Deliver into the central scoring zone."), option("farPost", "Far post", "Send the ball beyond the defence to the back post."), option("target", "Best aerial target", "Find the strongest available aerial receiver.")] },
  { key: "crossPosition", label: "Crossing point", category: "Final third", scope: "both", description: "Where to release the cross.", options: [option("early", "Early", "Cross before reaching the final line."), option("mixed", "Mixed", "Cross from the point the situation favours."), option("byline", "Byline", "Carry deep before delivering or cutting back.")] },
  { key: "shotSelection", label: "Shot selection", category: "Final third", scope: "both", description: "How patient to be before shooting.", options: [option("workIntoBox", "Work into box", "Keep combining until a close, clear chance appears."), option("balanced", "Balanced", "Shoot when chance quality and alternatives justify it."), option("shootOnSight", "Shoot on sight", "Take an early strike whenever goal is visible.")] },
  { key: "shotTechnique", label: "Finishing technique", category: "Final third", scope: "both", description: "Preferred way to strike the ball.", options: [option("mixed", "Situational", "Choose technique from angle, distance and pressure."), option("placed", "Place it", "Prioritise accuracy and guide the ball toward a corner."), option("power", "Hit with power", "Drive through the ball with maximum pace."), option("chip", "Chip keeper", "Lift the ball over an advancing goalkeeper."), option("firstTime", "First time", "Strike before taking a settling touch.")] },
  { key: "boxRole", label: "Position for crosses", category: "Final third", scope: "player", description: "Where to be as wide service arrives.", options: [option("stayBack", "Stay back", "Remain outside the attack to guard transitions."), option("edge", "Edge of box", "Wait for cutbacks, clearances and long shots."), option("nearPost", "Near post", "Sprint across the first defender at the near post."), option("centre", "Centre", "Occupy the central penalty spot scoring lane."), option("farPost", "Far post", "Arrive behind defenders at the back post.")] },
  { key: "defensiveTask", label: "Defensive task", category: "Defending", scope: "both", description: "Primary positioning job without the ball.", options: [option("holdZone", "Hold zone", "Protect the assigned zone and maintain the line."), option("stepOut", "Step out", "Leave the line to confront receivers between units."), option("cover", "Cover", "Drop behind teammates to protect space in behind."), option("trackRunner", "Track runner", "Follow the most dangerous run through the zone.")] },
  { key: "pressTrigger", label: "Press trigger", category: "Defending", scope: "both", description: "When to leave shape and close the ball.", options: [option("never", "Never", "Stay in the block rather than pressing the carrier."), option("badTouch", "On bad touch", "Jump forward when the carrier loses close control."), option("onReceive", "On receive", "Close immediately as the opponent receives."), option("always", "Always", "Press whenever the carrier enters reachable space.")] },
  { key: "pressDirection", label: "Show opponent", category: "Defending", scope: "both", description: "Angle of the pressing run.", options: [option("normal", "Situational", "Approach directly and react to support."), option("inside", "Inside", "Curve the press to force the carrier centrally."), option("outside", "Outside", "Curve the press to force the carrier toward touch."), option("weakFoot", "Weak foot", "Block the stronger-foot exit and show the weak side.")] },
  { key: "tackleStyle", label: "Tackling", category: "Defending", scope: "both", description: "Risk and timing of challenges.", options: [option("stayOnFeet", "Stay on feet", "Delay and challenge only with a controlled opening."), option("normal", "Normal", "Tackle when normal reach and odds allow."), option("hard", "Tackle hard", "Attack the ball aggressively with greater foul and card risk.")] },
  { key: "interceptionStyle", label: "Interceptions", category: "Defending", scope: "both", description: "Willingness to leave position to cut out passes.", options: [option("holdShape", "Hold shape", "Intercept only balls passing very close by."), option("normal", "Normal", "Step into a clearly reachable passing lane."), option("stepIn", "Step in", "Anticipate and attack passing lanes aggressively.")] },
  { key: "aerialApproach", label: "Aerial challenges", category: "Defending", scope: "both", description: "Positioning commitment for high balls.", options: [option("avoid", "Avoid", "Stay available for the second ball rather than contesting."), option("normal", "Normal", "Challenge when the high ball enters the normal zone."), option("dominate", "Dominate", "Attack the dropping ball early and seek the primary duel.")] },
  { key: "transitionAttack", label: "After winning the ball", category: "Transitions", scope: "both", description: "First action after a regain.", options: [option("secure", "Secure possession", "Protect the first pass and move away from pressure."), option("holdShape", "Hold shape", "Keep positions while controlled support arrives."), option("counter", "Counter", "Sprint and pass forward immediately into transition space.")] },
  { key: "transitionDefense", label: "After losing the ball", category: "Transitions", scope: "both", description: "Immediate response to a turnover.", options: [option("regroup", "Regroup", "Recover rapidly into the defensive block."), option("delay", "Delay", "Nearest player slows the counter while others recover."), option("counterPress", "Counter-press", "Nearby players swarm the ball immediately.")] },
  { key: "recoveryIntensity", label: "Recovery runs", category: "Transitions", scope: "both", description: "Urgency when running back toward goal.", options: [option("normal", "Normal", "Recover at the pace demanded by danger."), option("urgent", "Urgent", "Sprint back goal-side whenever possession is lost.")] },
  { key: "goalkeeperPosition", label: "Keeper starting position", category: "Goalkeeping", scope: "both", description: "Depth behind the defensive line.", positions: ["GK"], options: [option("deep", "On line", "Remain close to goal and protect the line."), option("normal", "Normal", "Balance line protection with reachable through balls."), option("sweeper", "Sweeper keeper", "Start high and rush beyond the box to sweep danger.")] },
  { key: "goalkeeperCrosses", label: "Keeper on crosses", category: "Goalkeeping", scope: "both", description: "Decision on balls entering the box.", positions: ["GK"], options: [option("holdLine", "Hold line", "Remain on the line and react to the finish."), option("claim", "Claim", "Come through traffic and catch reachable crosses."), option("punch", "Punch", "Attack the cross and punch it clear under pressure.")] },
  { key: "goalkeeperDistribution", label: "Keeper distribution", category: "Goalkeeping", scope: "both", description: "Typical release distance.", positions: ["GK"], options: [option("short", "Short", "Roll or pass to nearby defenders."), option("mixed", "Mixed", "Choose release distance from pressure and shape."), option("long", "Long", "Kick or throw beyond the first pressure line.")] },
  { key: "goalkeeperTarget", label: "Keeper target", category: "Goalkeeping", scope: "both", description: "Position group sought on distribution.", positions: ["GK"], options: [option("centreBacks", "Centre-backs", "Find central defenders for build-up."), option("fullBacks", "Full-backs", "Release toward defenders in wide lanes."), option("playmaker", "Playmaker", "Find a central midfielder able to turn."), option("flanks", "Flanks", "Launch toward wide players and touchlines."), option("striker", "Striker", "Play directly toward the highest forward.")] },
  { key: "goalkeeperRelease", label: "Keeper release speed", category: "Goalkeeping", scope: "both", description: "How quickly possession is restarted.", positions: ["GK"], options: [option("slow", "Slow down", "Hold the ball and let the side reset."), option("normal", "Normal", "Release when a sound option appears."), option("quick", "Release quickly", "Start attacks before the opponent can recover.")] },
  { key: "goalkeeperOneOnOne", label: "Keeper one-on-ones", category: "Goalkeeping", scope: "both", description: "Response when an attacker breaks toward goal.", positions: ["GK"], options: [option("hold", "Hold position", "Protect the goal and wait for the attacker to commit."), option("balanced", "Balanced", "Choose whether to advance from distance and support."), option("rush", "Rush out", "Close the attacker quickly and narrow the shooting angle.")] },
  { key: "cornerDelivery", label: "Corner routine", category: "Set pieces", scope: "both", description: "Primary corner delivery zone.", options: [option("short", "Short", "Use a nearby teammate to create a new angle."), option("nearPost", "Near post", "Drive the corner into the front-post run."), option("centre", "Centre", "Deliver around the penalty spot."), option("farPost", "Far post", "Hang the corner toward the back-post pack.")] },
  { key: "cornerRole", label: "Role at attacking corners", category: "Set pieces", scope: "player", description: "Individual starting job for own corners.", options: [option("stayBack", "Stay back", "Guard against the counterattack."), option("edge", "Edge of box", "Collect clearances and attack second balls."), option("nearPost", "Attack near post", "Make the first-post run."), option("centre", "Attack centre", "Compete in the central scoring zone."), option("farPost", "Attack far post", "Arrive at the back post."), option("markKeeper", "Disrupt keeper", "Occupy the goalkeeper without committing a foul.")] },
  { key: "throwInStyle", label: "Throw-in choice", category: "Set pieces", scope: "both", description: "Distance and route from the touchline.", options: [option("short", "Short to feet", "Restart safely to a nearby teammate."), option("line", "Down the line", "Throw ahead along the touchline."), option("long", "Long into area", "Launch toward a crowded advanced target zone.")] },
  { key: "freeKickRole", label: "Role at attacking free kicks", category: "Set pieces", scope: "player", description: "Position while a teammate delivers.", options: [option("stayBack", "Stay back", "Protect against the counterattack."), option("edge", "Edge of box", "Wait for a clearance or cutback."), option("attack", "Attack area", "Run into the main finishing zone."), option("disruptWall", "Disrupt wall", "Move around the wall to alter sight lines legally.")] },
] as const satisfies readonly ChoiceInstructionDefinition[];

export type ChoiceDirectiveKey = (typeof CHOICE_INSTRUCTIONS)[number]["key"];

export const INSTRUCTION_CATEGORIES: readonly InstructionCategory[] = [
  "Movement",
  "Possession",
  "Passing",
  "Final third",
  "Defending",
  "Transitions",
  "Goalkeeping",
  "Set pieces",
];

const booleanKeySet = new Set<string>(BOOLEAN_INSTRUCTIONS.map((entry) => entry.key));
const choiceByKey = new Map<string, ChoiceInstructionDefinition>(
  CHOICE_INSTRUCTIONS.map((entry) => [entry.key, entry]),
);

export function isBooleanDirectiveKey(key: string): key is BooleanDirectiveKey {
  return booleanKeySet.has(key);
}

export function choiceInstruction(key: string): ChoiceInstructionDefinition | undefined {
  return choiceByKey.get(key);
}

export function instructionApplies(
  definition: BooleanInstructionDefinition | ChoiceInstructionDefinition,
  scope: "team" | "player",
  position?: string,
): boolean {
  if (definition.scope !== "both" && definition.scope !== scope) return false;
  if (scope === "player" && definition.positions?.length && position && !definition.positions.includes(position)) return false;
  return true;
}
