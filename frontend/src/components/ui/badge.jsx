import * as React from "react"

const badgeVariants = {
  default: "bg-blue-100 text-blue-800 border border-blue-300",
  secondary: "bg-gray-100 text-gray-800 border border-gray-300",
  destructive: "bg-red-100 text-red-800 border border-red-300",
  outline: "bg-white text-gray-800 border border-gray-300",
  success: "bg-green-100 text-green-800 border border-green-300",
  warning: "bg-yellow-100 text-yellow-800 border border-yellow-300",
  pending: "bg-gray-100 text-gray-700 border border-gray-300",
  downloading: "bg-blue-100 text-blue-700 border border-blue-300",
  uploading: "bg-purple-100 text-purple-700 border border-purple-300",
  completed: "bg-green-100 text-green-700 border border-green-300",
  failed: "bg-red-100 text-red-700 border border-red-300",
}

const Badge = React.forwardRef(
  ({ className, variant = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
        badgeVariants[variant] || badgeVariants.default
      } ${className || ""}`}
      {...props}
    />
  )
)
Badge.displayName = "Badge"

export { Badge, badgeVariants }
