export default function SectionHeader({ children }) {
  return (
    <div className="section-header">
      <div className="section-header__bar" />
      <div className="section-header__label">{children}</div>
    </div>
  )
}
