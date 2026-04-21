import * as React from "react"

const Progress = React.forwardRef(({ className, value = 0, ...props }, ref) => (
  <div
    ref={ref}
    className={`relative w-full h-2 bg-gray-200 rounded-full overflow-hidden ${className || ""}`}
    {...props}
  >
    <div
      className="h-full bg-blue-600 transition-all rounded-full"
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
))
Progress.displayName = "Progress"

export { Progress }
