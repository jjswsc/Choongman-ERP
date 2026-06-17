// QR code ที่สร้างจากรูปแบบคงที่ (decorative, mock)
const PATTERN = [
  "1111111011101111111",
  "1000001010101000001",
  "1011101000101011101",
  "1011101011001011101",
  "1011101001101011101",
  "1000001010101000001",
  "1111111010101111111",
  "0000000011100000000",
  "1101011101011010110",
  "0010110010110101001",
  "1110011100101110011",
  "0101010011010010100",
  "1011101101011101101",
  "0000000101100110010",
  "1111111010101101011",
  "1000001011100100110",
  "1011101000111011101",
  "1011101101010010100",
  "1111111011101110011",
]

export function QrCode({ className = "h-24 w-24" }: { className?: string }) {
  return (
    <div className={`${className} rounded-lg bg-white p-1.5`}>
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: `repeat(${PATTERN[0].length}, 1fr)`,
          gridTemplateRows: `repeat(${PATTERN.length}, 1fr)`,
        }}
        role="img"
        aria-label="QR code สมาชิก"
      >
        {PATTERN.flatMap((row, y) =>
          row.split("").map((cell, x) => (
            <span
              key={`${x}-${y}`}
              className={cell === "1" ? "bg-black" : "bg-white"}
            />
          )),
        )}
      </div>
    </div>
  )
}
