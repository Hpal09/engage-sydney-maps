/**
 * PHASE 6: Kalman Filter for GPS Tracking
 *
 * Implements a 2D Kalman filter for smoothing GPS coordinates and reducing jitter.
 * Uses sensor fusion with compass heading for better velocity estimation.
 *
 * Benefits:
 * - Reduces GPS jitter and noise
 * - Predictive position estimation during GPS dropouts
 * - Adaptive filtering based on GPS accuracy
 * - Smoother user location tracking
 *
 * Algorithm:
 * - State: [x, y, vx, vy] (position + velocity)
 * - Predict step: Use velocity to predict next position
 * - Update step: Correct prediction with GPS measurement
 * - Adaptive noise: Adjust based on GPS accuracy
 */

/**
 * Simple 2D matrix operations
 */
class Matrix {
  constructor(public data: number[][]) {}

  static identity(size: number): Matrix {
    const data = Array(size).fill(0).map((_, i) =>
      Array(size).fill(0).map((_, j) => (i === j ? 1 : 0))
    );
    return new Matrix(data);
  }

  multiply(other: Matrix): Matrix {
    const rows = this.data.length;
    const cols = other.data[0].length;
    const inner = this.data[0].length;

    const result = Array(rows).fill(0).map(() => Array(cols).fill(0));

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        for (let k = 0; k < inner; k++) {
          result[i][j] += this.data[i][k] * other.data[k][j];
        }
      }
    }

    return new Matrix(result);
  }

  add(other: Matrix): Matrix {
    const result = this.data.map((row, i) =>
      row.map((val, j) => val + other.data[i][j])
    );
    return new Matrix(result);
  }

  subtract(other: Matrix): Matrix {
    const result = this.data.map((row, i) =>
      row.map((val, j) => val - other.data[i][j])
    );
    return new Matrix(result);
  }

  transpose(): Matrix {
    const rows = this.data.length;
    const cols = this.data[0].length;
    const result = Array(cols).fill(0).map(() => Array(rows).fill(0));

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        result[j][i] = this.data[i][j];
      }
    }

    return new Matrix(result);
  }

  inverse2x2(): Matrix {
    if (this.data.length !== 2 || this.data[0].length !== 2) {
      throw new Error('inverse2x2 only works for 2x2 matrices');
    }

    const [[a, b], [c, d]] = this.data;
    const det = a * d - b * c;

    if (Math.abs(det) < 1e-10) {
      // Singular matrix, return identity
      return Matrix.identity(2);
    }

    return new Matrix([
      [d / det, -b / det],
      [-c / det, a / det]
    ]);
  }

  scale(scalar: number): Matrix {
    const result = this.data.map(row => row.map(val => val * scalar));
    return new Matrix(result);
  }
}

/**
 * Kalman Filter for 2D GPS tracking
 */
export class KalmanFilter {
  // State: [x, y, vx, vy]
  private state: Matrix;

  // Covariance matrix (uncertainty in state)
  private covariance: Matrix;

  // State transition matrix (how state evolves)
  private transitionMatrix: Matrix;

  // Measurement matrix (maps state to measurements)
  private measurementMatrix: Matrix;

  // Process noise (model uncertainty)
  private processNoise: Matrix;

  // Measurement noise (GPS uncertainty)
  private measurementNoise: Matrix;

  // Timestamp of last update
  private lastUpdateTime: number;

  // Configuration
  private config: {
    processNoisePosition: number;
    processNoiseVelocity: number;
    defaultMeasurementNoise: number;
    minMeasurementNoise: number;
    maxMeasurementNoise: number;
  };

  constructor(initialX: number, initialY: number) {
    // Initial state: [x, y, vx=0, vy=0]
    this.state = new Matrix([[initialX], [initialY], [0], [0]]);

    // Initial covariance (high uncertainty)
    this.covariance = Matrix.identity(4).scale(100);

    // Measurement matrix: H = [1 0 0 0; 0 1 0 0] (measure x, y only)
    this.measurementMatrix = new Matrix([
      [1, 0, 0, 0],
      [0, 1, 0, 0]
    ]);

    // Process noise (tuned for GPS)
    this.config = {
      processNoisePosition: 0.5,   // Position uncertainty per second
      processNoiseVelocity: 1.0,   // Velocity uncertainty per second
      defaultMeasurementNoise: 10, // Default GPS noise (meters)
      minMeasurementNoise: 5,      // Min GPS noise
      maxMeasurementNoise: 50      // Max GPS noise
    };

    // Initialize process noise matrix
    this.processNoise = new Matrix([
      [this.config.processNoisePosition, 0, 0, 0],
      [0, this.config.processNoisePosition, 0, 0],
      [0, 0, this.config.processNoiseVelocity, 0],
      [0, 0, 0, this.config.processNoiseVelocity]
    ]);

    // Initialize measurement noise matrix
    this.measurementNoise = Matrix.identity(2).scale(
      this.config.defaultMeasurementNoise
    );

    // Initialize transition matrix (will be updated with dt)
    this.transitionMatrix = Matrix.identity(4);

    this.lastUpdateTime = Date.now();
  }

  /**
   * Update transition matrix based on time delta
   */
  private updateTransitionMatrix(dt: number): void {
    // F = [1 0 dt  0 ]
    //     [0 1  0 dt ]
    //     [0 0  1  0 ]
    //     [0 0  0  1 ]
    this.transitionMatrix = new Matrix([
      [1, 0, dt, 0],
      [0, 1, 0, dt],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ]);
  }

  /**
   * Predict step: Use velocity to predict next position
   */
  predict(dt: number): void {
    // Update transition matrix with time delta
    this.updateTransitionMatrix(dt);

    // Predict state: x = F * x
    this.state = this.transitionMatrix.multiply(this.state);

    // Predict covariance: P = F * P * F^T + Q
    const Ft = this.transitionMatrix.transpose();
    this.covariance = this.transitionMatrix
      .multiply(this.covariance)
      .multiply(Ft)
      .add(this.processNoise.scale(dt));
  }

  /**
   * Update step: Correct prediction with GPS measurement
   */
  update(
    measuredX: number,
    measuredY: number,
    accuracy?: number,
    heading?: number
  ): { x: number; y: number; vx: number; vy: number } {
    const currentTime = Date.now();
    const dt = Math.min((currentTime - this.lastUpdateTime) / 1000, 1.0); // Max 1 second
    this.lastUpdateTime = currentTime;

    // Predict step
    if (dt > 0) {
      this.predict(dt);
    }

    // Adaptive measurement noise based on GPS accuracy
    const measurementNoiseValue = accuracy
      ? Math.max(
          this.config.minMeasurementNoise,
          Math.min(this.config.maxMeasurementNoise, accuracy)
        )
      : this.config.defaultMeasurementNoise;

    this.measurementNoise = Matrix.identity(2).scale(
      measurementNoiseValue * measurementNoiseValue
    ); // Variance

    // Measurement: z = [measuredX, measuredY]
    const measurement = new Matrix([[measuredX], [measuredY]]);

    // Innovation: y = z - H * x
    const predictedMeasurement = this.measurementMatrix.multiply(this.state);
    const innovation = measurement.subtract(predictedMeasurement);

    // Innovation covariance: S = H * P * H^T + R
    const Ht = this.measurementMatrix.transpose();
    const innovationCovariance = this.measurementMatrix
      .multiply(this.covariance)
      .multiply(Ht)
      .add(this.measurementNoise);

    // Kalman gain: K = P * H^T * S^-1
    const kalmanGain = this.covariance
      .multiply(Ht)
      .multiply(innovationCovariance.inverse2x2());

    // Update state: x = x + K * y
    this.state = this.state.add(kalmanGain.multiply(innovation));

    // Update covariance: P = (I - K * H) * P
    const I = Matrix.identity(4);
    const KH = kalmanGain.multiply(this.measurementMatrix);
    this.covariance = I.subtract(KH).multiply(this.covariance);

    // Optional: Incorporate heading for better velocity estimation
    if (heading !== undefined && heading !== null) {
      this.incorporateHeading(heading, dt);
    }

    return {
      x: this.state.data[0][0],
      y: this.state.data[1][0],
      vx: this.state.data[2][0],
      vy: this.state.data[3][0]
    };
  }

  /**
   * Incorporate compass heading to improve velocity estimation
   */
  private incorporateHeading(headingDegrees: number, dt: number): void {
    // Get current velocity magnitude
    const vx = this.state.data[2][0];
    const vy = this.state.data[3][0];
    const speed = Math.sqrt(vx * vx + vy * vy);

    // If speed is very low, don't adjust (stationary)
    if (speed < 0.1) return;

    // Convert heading to radians (0° = North = -Y, 90° = East = +X)
    const headingRad = (headingDegrees * Math.PI) / 180;

    // Calculate expected velocity from heading
    const expectedVx = Math.sin(headingRad) * speed;
    const expectedVy = -Math.cos(headingRad) * speed;

    // Gently blend heading-based velocity with filter velocity
    const alpha = 0.3; // Blend factor (30% heading, 70% filter)
    this.state.data[2][0] = vx * (1 - alpha) + expectedVx * alpha;
    this.state.data[3][0] = vy * (1 - alpha) + expectedVy * alpha;
  }

  /**
   * Get current filtered position
   */
  getPosition(): { x: number; y: number } {
    return {
      x: this.state.data[0][0],
      y: this.state.data[1][0]
    };
  }

  /**
   * Get current velocity
   */
  getVelocity(): { vx: number; vy: number } {
    return {
      vx: this.state.data[2][0],
      vy: this.state.data[3][0]
    };
  }

  /**
   * Get current speed (magnitude of velocity)
   */
  getSpeed(): number {
    const vx = this.state.data[2][0];
    const vy = this.state.data[3][0];
    return Math.sqrt(vx * vx + vy * vy);
  }

  /**
   * Reset filter with new position
   */
  reset(x: number, y: number): void {
    this.state = new Matrix([[x], [y], [0], [0]]);
    this.covariance = Matrix.identity(4).scale(100);
    this.lastUpdateTime = Date.now();
  }
}

/**
 * Manager for Kalman filter instances
 * Handles filter lifecycle and coordinate conversion
 */
export class KalmanFilterManager {
  private filter: KalmanFilter | null = null;
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.NEXT_PUBLIC_USE_KALMAN_FILTER !== 'false';
  }

  /**
   * Process GPS update with Kalman filtering
   */
  processGPS(
    lat: number,
    lng: number,
    accuracy?: number,
    heading?: number
  ): { lat: number; lng: number; vx: number; vy: number } {
    if (!this.enabled) {
      return { lat, lng, vx: 0, vy: 0 };
    }

    // Initialize filter on first update
    if (!this.filter) {
      this.filter = new KalmanFilter(lat, lng);
      return { lat, lng, vx: 0, vy: 0 };
    }

    // Update filter with GPS measurement
    const result = this.filter.update(lat, lng, accuracy, heading);

    return {
      lat: result.x,
      lng: result.y,
      vx: result.vx,
      vy: result.vy
    };
  }

  /**
   * Get current filtered position
   */
  getPosition(): { lat: number; lng: number } | null {
    if (!this.filter) return null;
    const pos = this.filter.getPosition();
    return { lat: pos.x, lng: pos.y };
  }

  /**
   * Get current speed in meters per second
   * Note: vx and vy are in degrees, need conversion for real speed
   */
  getSpeed(): number {
    if (!this.filter) return 0;
    return this.filter.getSpeed();
  }

  /**
   * Reset filter (e.g., on GPS jump)
   */
  reset(lat: number, lng: number): void {
    if (this.filter) {
      this.filter.reset(lat, lng);
    } else {
      this.filter = new KalmanFilter(lat, lng);
    }
  }

  /**
   * Check if filter is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable/disable filter
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.filter = null;
    }
  }
}

// Singleton instance
let kalmanFilterManagerInstance: KalmanFilterManager | null = null;

/**
 * Get the singleton Kalman filter manager
 */
export function getKalmanFilterManager(): KalmanFilterManager {
  if (!kalmanFilterManagerInstance) {
    kalmanFilterManagerInstance = new KalmanFilterManager();
  }
  return kalmanFilterManagerInstance;
}
