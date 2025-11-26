"use client";

interface Floor {
  id: string;
  name: string;
  level: number;
  svgPath: string;
}

interface FloorSelectorProps {
  floors: Floor[];
  selectedFloorId: string | null;
  onFloorChange: (floorId: string) => void;
}

// Extract initials and numbers from floor name
function getFloorLabel(floorName: string): string {
  // Word to number mapping
  const wordToNumber: { [key: string]: string } = {
    'one': '1', 'first': '1',
    'two': '2', 'second': '2',
    'three': '3', 'third': '3',
    'four': '4', 'fourth': '4',
    'five': '5', 'fifth': '5',
    'six': '6', 'sixth': '6',
    'seven': '7', 'seventh': '7',
    'eight': '8', 'eighth': '8',
    'nine': '9', 'ninth': '9',
    'ten': '10', 'tenth': '10',
  };

  // Remove common words and keep only initials and numbers
  const cleaned = floorName
    .replace(/floor|level/gi, '')  // Remove "floor" or "level"
    .trim()
    .toLowerCase();

  // If it starts with "Ground" or "G", return "G"
  if (/^ground/i.test(cleaned) || cleaned === 'g') {
    return 'G';
  }

  // If it starts with "Basement" or "B", extract B + number
  const basementMatch = cleaned.match(/^basement\s*(\d+)|^b(\d+)/i);
  if (basementMatch) {
    const num = basementMatch[1] || basementMatch[2];
    return `B${num}`;
  }

  // Check for word numbers and convert to digits
  for (const [word, digit] of Object.entries(wordToNumber)) {
    if (cleaned.includes(word)) {
      return digit;
    }
  }

  // If it's just a number, return it
  const numberMatch = cleaned.match(/^\d+$/);
  if (numberMatch) {
    return numberMatch[0];
  }

  // Otherwise, return the first letter or the whole cleaned string if short
  return cleaned.length <= 3 ? cleaned.toUpperCase() : cleaned.charAt(0).toUpperCase();
}

export default function FloorSelector({ floors, selectedFloorId, onFloorChange }: FloorSelectorProps) {
  if (!floors || floors.length === 0) return null;

  // Sort floors by level (highest first)
  const sortedFloors = [...floors].sort((a, b) => b.level - a.level);

  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center bg-white rounded-lg shadow-lg overflow-hidden">
      {sortedFloors.map((floor, index) => {
        const isSelected = floor.id === selectedFloorId;
        const label = getFloorLabel(floor.name);

        return (
          <button
            key={floor.id}
            onClick={() => onFloorChange(floor.id)}
            className={`
              w-12 h-12 flex items-center justify-center text-sm font-bold
              transition-all duration-200
              ${isSelected
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
              }
              ${index !== sortedFloors.length - 1 ? 'border-b border-gray-200' : ''}
            `}
            aria-label={`Floor ${floor.name}`}
            title={floor.name}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
