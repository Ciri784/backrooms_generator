#!/usr/bin/env python3
"""
Backrooms Generator
Generates liminal space descriptions inspired by the Backrooms, Kane Pixels, and the uncanny.
"""

import random
import argparse

# Templates for room descriptions
ROOMS = [
    ("a large {room_size} lobby", "The ceiling is impossibly high. Yellow wallpaper peels in long strips."),
    ("a {room_size} office space", "Desks are arranged in perfect rows. None of the chairs face the same direction."),
    ("a long, narrow hallway", "The walls are covered in {wall_cover}. Doors line both sides. None of them have handles."),
    ("an abandoned warehouse", "Shipping containers sit in no particular order. The floor is wet. The light is yellow."),
    ("a {room_size} school corridor", "Classroom doors are closed. Behind one of them, you hear something."),
    ("a {room_size} hotel lobby", "The front desk is unmanned. Always. A radio somewhere is playing nothing."),
    ("an underground parking structure", "Cars that don't move. The lights flicker. The exit is never where you left it."),
    ("a {room_size} hospital waiting room", "Magazines from years ago. Water stains on the ceiling. The waiting never ends."),
]

ROOM_SIZES = ["small", "medium-sized", "large", "vast", "seemingly infinite"]

WALL_COVERINGS = [
    "yellow wallpaper, peeling at the edges",
    "water-stained ceiling tiles",
    "mysterious brown stains",
    "tiles that shouldn't be there",
    "windows that look out on nothing",
]

CEILING_ISSUES = [
    "The ceiling is too high.",
    "The ceiling is too low.",
    "There is no ceiling. You don't want to look up.",
    "The ceiling tiles are arranged wrong.",
]

LIGHT_ISSUES = [
    "Somewhere, a fluorescent light is buzzing.",
    "A light flickers in the corner of your vision.",
    "The lights are too bright. Or too dim. You can't tell anymore.",
    "There are no windows. There is no natural light.",
    "Yellow light fills every corner. It's always yellow here.",
]

SMELLS = [
    "The air smells like wet carpet.",
    "There's an underlying scent of something metallic.",
    "It smells like old paper and dust.",
    "The air is stale. Has it been circulating?",
    "Something sweet. Something rotting underneath.",
]

SOUNDS = [
    "You hear something in the distance.",
    "A fluorescent light is buzzing.",
    "Water dripping. Constant. Rhythmic.",
    "Distant radio static. No station.",
    "Your footsteps echo too much.",
    "A door closes somewhere. But all doors are closed.",
    "You hear breathing. You're alone.",
]

ENTITY_HINTS = [
    "No entities detected... for now.",
    "You are not alone here. You just can't see them yet.",
    "Something watched you come in. It's still watching.",
    "The entities in this level are known to be territorial.",
    "You hear footsteps. They don't match yours.",
    "A sound behind you. Don't turn around.",
]

STABILITY_LEVELS = [
    "12%", "8%", "23%", "3%", "31%", "17%", "41%", "0%", "67%", "unstable"
]

LEVEL_NAMES = [
    ("0", "THE LOBBY", "The most well-known level. Office maze. Yellow walls. The hum."),
    ("1", "THE PACKING ROOMS", "Rooms full of wooden crates. Some of them are open."),
    ("2", "PIPE HEAVEN", "An endless network of pipes. It hums. You hear water."),
    ("3", "THE OFFICES", "Filing cabinets. Papers everywhere. Something in the cabinets moves."),
    ("4", "ABANDONED CONCRETE", "Structural supports you don't understand. This place wasn't built."),
    ("5", "HOTELS & ROOMS", "A hotel that goes on forever. Room 5 is always occupied."),
    ("6", "THE WATER ZONE", "Pools of liquid in dark rooms. Some of it is water. Probably."),
    ("7", "THE GOLF COURSE", "An endless golf course. The flag is always the same distance away."),
]

def generate_room():
    """Generate a single room description."""
    room_template, room_desc = random.choice(ROOMS)
    room_size = random.choice(ROOM_SIZES)
    
    level_num, level_name, level_subtitle = random.choice(LEVEL_NAMES)
    
    ceiling = random.choice(CEILING_ISSUES)
    wall_cover = random.choice(WALL_COVERINGS)
    light = random.choice(LIGHT_ISSUES)
    smell = random.choice(SMELLS)
    
    # Generate 2-4 sounds
    num_sounds = random.randint(2, 4)
    sounds = random.sample(SOUNDS, min(num_sounds, len(SOUNDS)))
    
    entity = random.choice(ENTITY_HINTS)
    stability = random.choice(STABILITY_LEVELS)
    
    # Build the description
    desc = f"You are in {room_template.format(room_size=room_size, wall_cover=wall_cover)}.\n"
    desc += f"{room_desc}\n\n"
    desc += f"{ceiling}\n"
    desc += f"{light}\n"
    desc += f"{smell}\n\n"
    
    for sound in sounds:
        desc += f"{sound}\n"
    
    desc += "\n"
    desc += "You can't remember how you got here.\n"
    desc += "There is no exit. There is only forward.\n\n"
    desc += f"» {entity}\n"
    desc += f"» Stability: {stability}\n"
    
    return level_num, level_name, level_subtitle, desc

def main():
    parser = argparse.ArgumentParser(description="Backrooms Generator - Generate liminal space descriptions")
    parser.add_argument("--count", type=int, default=1, help="Number of descriptions to generate")
    args = parser.parse_args()
    
    for i in range(args.count):
        if args.count > 1 and i > 0:
            print("\n" + "=" * 60 + "\n")
        
        level_num, level_name, level_subtitle, desc = generate_room()
        
        header = f"LEVEL {level_num} — {level_name}"
        underline = "=" * len(header)
        
        print(header)
        print(underline)
        print(f"({level_subtitle})")
        print()
        print(desc)

if __name__ == "__main__":
    main()
