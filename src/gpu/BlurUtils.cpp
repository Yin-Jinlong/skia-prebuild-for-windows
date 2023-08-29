/*
 * Copyright 2023 Google LLC
 *
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

#include "src/gpu/BlurUtils.h"

#include "include/effects/SkRuntimeEffect.h"
#include "src/base/SkMathPriv.h"
#include "src/core/SkRuntimeEffectPriv.h"

#include <array>

namespace skgpu {

void Compute2DBlurKernel(SkSize sigma,
                         SkISize radius,
                         SkSpan<float> kernel) {
    // Callers likely had to calculate the radius prior to filling out the kernel value, which is
    // why it's provided; but make sure it's consistent with expectations.
    SkASSERT(BlurSigmaRadius(sigma.width()) == radius.width() &&
             BlurSigmaRadius(sigma.height()) == radius.height());

    // Callers are responsible for downscaling large sigmas to values that can be processed by the
    // effects, so ensure the radius won't overflow 'kernel'
    const int width = BlurKernelWidth(radius.width());
    const int height = BlurKernelWidth(radius.height());
    const size_t kernelSize = SkTo<size_t>(sk_64_mul(width, height));
    SkASSERT(kernelSize <= kernel.size());

    // And the definition of an identity blur should be sufficient that 2sigma^2 isn't near zero
    // when there's a non-trivial radius.
    const float twoSigmaSqrdX = 2.0f * sigma.width() * sigma.width();
    const float twoSigmaSqrdY = 2.0f * sigma.height() * sigma.height();
    SkASSERT((radius.width() == 0 || !SkScalarNearlyZero(twoSigmaSqrdX)) &&
             (radius.height() == 0 || !SkScalarNearlyZero(twoSigmaSqrdY)));

    // Setting the denominator to 1 when the radius is 0 automatically converts the remaining math
    // to the 1D Gaussian distribution. When both radii are 0, it correctly computes a weight of 1.0
    const float sigmaXDenom = radius.width() > 0 ? 1.0f / twoSigmaSqrdX : 1.f;
    const float sigmaYDenom = radius.height() > 0 ? 1.0f / twoSigmaSqrdY : 1.f;

    float sum = 0.0f;
    for (int x = 0; x < width; x++) {
        float xTerm = static_cast<float>(x - radius.width());
        xTerm = xTerm * xTerm * sigmaXDenom;
        for (int y = 0; y < height; y++) {
            float yTerm = static_cast<float>(y - radius.height());
            float xyTerm = sk_float_exp(-(xTerm + yTerm * yTerm * sigmaYDenom));
            // Note that the constant term (1/(sqrt(2*pi*sigma^2)) of the Gaussian
            // is dropped here, since we renormalize the kernel below.
            kernel[y * width + x] = xyTerm;
            sum += xyTerm;
        }
    }
    // Normalize the kernel
    float scale = 1.0f / sum;
    for (size_t i = 0; i < kernelSize; ++i) {
        kernel[i] *= scale;
    }
    // Zero remainder of the array
    memset(kernel.data() + kernelSize, 0, sizeof(float)*(kernel.size() - kernelSize));
}

void Compute1DBlurLinearKernel(float sigma,
                               int radius,
                               std::array<SkV4, kMaxBlurSamples/2>& offsetsAndKernel) {
    SkASSERT(sigma <= kMaxLinearBlurSigma);
    SkASSERT(radius == BlurSigmaRadius(sigma));
    SkASSERT(BlurLinearKernelWidth(radius) <= kMaxBlurSamples);

    // Given 2 adjacent gaussian points, they are blended as: Wi * Ci + Wj * Cj.
    // The GPU will mix Ci and Cj as Ci * (1 - x) + Cj * x during sampling.
    // Compute W', x such that W' * (Ci * (1 - x) + Cj * x) = Wi * Ci + Wj * Cj.
    // Solving W' * x = Wj, W' * (1 - x) = Wi:
    // W' = Wi + Wj
    // x = Wj / (Wi + Wj)
    auto get_new_weight = [](float* new_w, float* offset, float wi, float wj) {
        *new_w = wi + wj;
        *offset = wj / (wi + wj);
    };

    // Create a temporary standard kernel. The maximum blur radius that can be passed to this
    // function is (kMaxBlurSamples-1), so make an array large enough to hold the full kernel width.
    static constexpr int kMaxKernelWidth = BlurKernelWidth(kMaxBlurSamples - 1);
    SkASSERT(BlurKernelWidth(radius) <= kMaxKernelWidth);
    std::array<float, kMaxKernelWidth> fullKernel;
    Compute1DBlurKernel(sigma, radius, SkSpan<float>{fullKernel.data(), BlurKernelWidth(radius)});

    std::array<float, kMaxBlurSamples> kernel;
    std::array<float, kMaxBlurSamples> offsets;
    // Note that halfsize isn't just size / 2, but radius + 1. This is the size of the output array.
    int halfSize = skgpu::BlurLinearKernelWidth(radius);
    int halfRadius = halfSize / 2;
    int lowIndex = halfRadius - 1;

    // Compute1DGaussianKernel produces a full 2N + 1 kernel. Since the kernel can be mirrored,
    // compute only the upper half and mirror to the lower half.

    int index = radius;
    if (radius & 1) {
        // If N is odd, then use two samples.
        // The centre texel gets sampled twice, so halve its influence for each sample.
        // We essentially sample like this:
        // Texel edges
        // v    v    v    v
        // |    |    |    |
        // \-----^---/ Lower sample
        //      \---^-----/ Upper sample
        get_new_weight(&kernel[halfRadius],
                       &offsets[halfRadius],
                       fullKernel[index] * 0.5f,
                       fullKernel[index + 1]);
        kernel[lowIndex] = kernel[halfRadius];
        offsets[lowIndex] = -offsets[halfRadius];
        index++;
        lowIndex--;
    } else {
        // If N is even, then there are an even number of texels on either side of the centre texel.
        // Sample the centre texel directly.
        kernel[halfRadius] = fullKernel[index];
        offsets[halfRadius] = 0.0f;
    }
    index++;

    // Every other pair gets one sample.
    for (int i = halfRadius + 1; i < halfSize; index += 2, i++, lowIndex--) {
        get_new_weight(&kernel[i], &offsets[i], fullKernel[index], fullKernel[index + 1]);
        offsets[i] += static_cast<float>(index - radius);

        // Mirror to lower half.
        kernel[lowIndex] = kernel[i];
        offsets[lowIndex] = -offsets[i];
    }

    // Zero out remaining values in the arrays
    memset(kernel.data() + halfSize, 0, sizeof(float)*(kMaxBlurSamples - halfSize));
    memset(offsets.data() + halfSize, 0, sizeof(float)*(kMaxBlurSamples - halfSize));

    // Interleave into the output array to match the 1D SkSL effect
    for (int i = 0; i < skgpu::kMaxBlurSamples / 2; ++i) {
        offsetsAndKernel[i] = SkV4{offsets[2*i], kernel[2*i], offsets[2*i+1], kernel[2*i+1]};
    }
}

const SkRuntimeEffect* GetLinearBlur1DEffect(int radius) {
    static const auto makeEffect = [](int maxRadius) {
        SkASSERT(maxRadius < kMaxBlurSamples);
        return SkMakeRuntimeEffect(SkRuntimeEffect::MakeForShader,
                SkStringPrintf(
                       // The coefficients are always stored in for the max radius to keep the
                       // uniform block consistent across all effects.
                       "const int kMaxUniformKernelSize = %d / 2;"
                       // But to help lower-end GPUs with unrolling, we bucket the max loop level.
                       "const int kMaxLoopLimit = %d / 2 + 1;"

                       "uniform half4 offsetsAndKernel[kMaxUniformKernelSize];"
                       "uniform half2 dir;"
                       "uniform int radius;"
                       "uniform shader child;"

                       "half4 main(float2 coord) {"
                           "half4 sum = half4(0);"
                            "for (int i = 0; i < kMaxLoopLimit; ++i) {"
                                "half4 s = offsetsAndKernel[i];"
                                "if (radius < 2*i) { break; }"
                                "half2 o = offsetsAndKernel[i].x * dir;"
                                "sum += offsetsAndKernel[i].y * child.eval(coord + o);"

                                "if (radius <= 2*i) { break; }"
                                "o = offsetsAndKernel[i].z * dir;"
                                "sum += offsetsAndKernel[i].w * child.eval(coord + o);"
                            "}"
                            "return sum;"
                       "}", kMaxBlurSamples, maxRadius).c_str());
    };

    SkASSERT(radius > 0 && radius < kMaxBlurSamples);
    switch(SkNextLog2(radius)) {
        // Group radius [1,4] in the same shader
        case 0: [[fallthrough]];
        case 1: [[fallthrough]];
        case 2: {  static const SkRuntimeEffect* effect = makeEffect(4);
                   return effect; }
        case 3: {  static const SkRuntimeEffect* effect = makeEffect(8);
                   return effect; }
        case 4: {  static const SkRuntimeEffect* effect = makeEffect(16);
                   return effect; }
        case 5: {  static const SkRuntimeEffect* effect = makeEffect(kMaxBlurSamples - 1);
                   return effect; }
        default:
            SkUNREACHABLE;
    }
}

const SkRuntimeEffect* GetBlur2DEffect() {
    // TODO(michaelludwig): This shares a lot of similarity with the matrix convolution image filter
    // with convolveAlpha=true and a centered kernel size and offset (represented by just radii).
    // Perhaps it can be consolidated by having the runtime effect call out to module functions?
    static SkRuntimeEffect* effect = SkMakeRuntimeEffect(SkRuntimeEffect::MakeForShader,
        SkStringPrintf("const int kMaxUniformKernelSize = %d / 4;"
                       // Pack scalar coefficients into half4 for better packing on std140
                       "uniform half4 kernel[kMaxUniformKernelSize];"
                       "uniform int2 radii;"
                       "uniform shader child;"

                       "half4 main(float2 coord) {"
                           "half4 sum = half4(0);"

                           // The constant 1D loop will iterate kernelPos over
                           // [-radii.x,radii.x]X[-radii.y,radii.y].
                           "int2 kernelPos = -radii;"
                           "for (int i = 0; i < kMaxUniformKernelSize; ++i) {"
                               "if (kernelPos.y > radii.y) { break; }"

                                "half4 k4 = kernel[i];"
                                "for (int j = 0; j < 4; ++j) {"
                                    "if (kernelPos.y > radii.y) { break; }"
                                    "half k = k4[j];"

                                    "half4 c = child.eval(coord + half2(kernelPos));"
                                    "sum += c*k;"

                                    "kernelPos.x += 1;"
                                    "if (kernelPos.x > radii.x) {"
                                        "kernelPos.x = -radii.x;"
                                        "kernelPos.y += 1;"
                                    "}"
                                "}"
                           "}"
                           "return sum;"
                       "}", kMaxBlurSamples).c_str());
    // TODO(b/297590025): Bucket the 2D effect similarly to the 1D effect above.
    return effect;
}

} // namespace skgpu