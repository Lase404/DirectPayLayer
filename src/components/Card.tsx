import { ReactNode } from 'react'
import classNames from 'classnames'

interface CardProps {
  children: ReactNode
  className?: string
  title?: string
  footer?: ReactNode
}

export const Card = ({ children, className, title, footer }: CardProps) => {
  return (
    <div
      className={classNames(
        'bg-white rounded-xl shadow-md overflow-hidden',
        className
      )}
    >
      {title && (
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-medium text-gray-900">{title}</h3>
        </div>
      )}
      <div className="px-6 py-4">{children}</div>
      {footer && (
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          {footer}
        </div>
      )}
    </div>
  )
} 