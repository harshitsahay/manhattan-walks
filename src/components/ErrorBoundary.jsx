import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="map-error">
          <h2>Map failed to load</h2>
          <p>WebGL may be unavailable in this browser. Try a recent version of Chrome, Safari, or Firefox with hardware acceleration enabled.</p>
          <p className="map-error-detail">{this.state.error.message}</p>
        </div>
      )
    }
    return this.props.children
  }
}
