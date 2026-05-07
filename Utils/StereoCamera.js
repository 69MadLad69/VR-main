'use strict';
 
/**
 * StereoCamera — WebGL port of the classic OpenGL off-axis stereo camera.
 *
 * Instead of calling glFrustum / glTranslate directly, each method returns a
 * column-major Float32Array that you can pass straight to gl.uniformMatrix4fv.
 *
 * @param {number} Convergence          Zero-parallax plane distance (scene units).
 * @param {number} EyeSeparation        Inter-ocular distance (scene units).
 * @param {number} AspectRatio          Viewport width / height.
 * @param {number} FOV                  Vertical field-of-view in RADIANS.
 * @param {number} NearClippingDistance Near clip distance.
 * @param {number} FarClippingDistance  Far clip distance.
 */
function StereoCamera(
    Convergence,
    EyeSeparation,
    AspectRatio,
    FOV,
    NearClippingDistance,
    FarClippingDistance
) {
    this.mConvergence          = Convergence;
    this.eyeSeparation         = EyeSeparation;   // public alias used in main.js
    this.mAspectRatio          = AspectRatio;
    this.mFOV                  = FOV;             // radians
    this.mNearClippingDistance = NearClippingDistance;
    this.mFarClippingDistance  = FarClippingDistance;

    /**
     * Builds a column-major 4x4 frustum projection matrix equivalent to
     * glFrustum(left, right, bottom, top, near, far).
     */
    this._makeFrustum = function(left, right, bottom, top, near, far) {
        let rl = right  - left;
        let tb = top    - bottom;
        let fn = far    - near;
        // Stored column-by-column (WebGL / OpenGL convention)
        return new Float32Array([
            2*near/rl,          0,                    0,              0,
            0,                  2*near/tb,             0,              0,
            (right+left)/rl,   (top+bottom)/tb,  -(far+near)/fn,    -1,
            0,                  0,              -2*far*near/fn,       0
        ]);
    };

    /**
     * Returns the asymmetric frustum projection matrix for the LEFT eye.
     *
     * Mirrors the OpenGL sequence:
     *   glMatrixMode(GL_PROJECTION); glLoadIdentity();
     *   glFrustum(left, right, bottom, top, near, far);
     *
     * The corresponding model-view eye shift (+eyeSep/2, 0, 0) is applied
     * separately in main.js via m4.translation so the two concerns are decoupled.
     */
    this.calcLeftFrustum = function() {
        let top    =  this.mNearClippingDistance * Math.tan(this.mFOV / 2);
        let bottom = -top;
        let a = this.mAspectRatio * Math.tan(this.mFOV / 2) * this.mConvergence;
        let b = a - this.eyeSeparation / 2;
        let c = a + this.eyeSeparation / 2;
        let left  = -b * this.mNearClippingDistance / this.mConvergence;
        let right =  c * this.mNearClippingDistance / this.mConvergence;
        return this._makeFrustum(left, right, bottom, top,
            this.mNearClippingDistance, this.mFarClippingDistance);
    };
 
    /**
     * Returns the asymmetric frustum projection matrix for the RIGHT eye.
     *
     * Mirrors:
     *   glMatrixMode(GL_PROJECTION); glLoadIdentity();
     *   glFrustum(left, right, bottom, top, near, far);
     *
     * Model-view shift (-eyeSep/2, 0, 0) applied separately in main.js.
     */
    this.calcRightFrustum = function() {
        let top    =  this.mNearClippingDistance * Math.tan(this.mFOV / 2);
        let bottom = -top;
        let a = this.mAspectRatio * Math.tan(this.mFOV / 2) * this.mConvergence;
        let b = a - this.eyeSeparation / 2;
        let c = a + this.eyeSeparation / 2;
        // Note: left/right are swapped compared to the left eye
        let left  = -c * this.mNearClippingDistance / this.mConvergence;
        let right =  b * this.mNearClippingDistance / this.mConvergence;
        return this._makeFrustum(left, right, bottom, top,
            this.mNearClippingDistance, this.mFarClippingDistance);
    };
}