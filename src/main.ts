import './style.css';

import { mat4 } from 'wgpu-matrix';
import shaderCode from './cube.wgsl?raw';
const resolution = 800;

// copy-paste from https://github.com/spsquared/softbody-webgpu

const errorMessage = document.getElementById('errorMessage') as HTMLDivElement;
function showErrorAndExit(err: string | Error): never {
    errorMessage.innerText += err + '\n';
    errorMessage.style.display = 'block';
    throw err instanceof Error ? err : new Error(err);
}

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
canvas.width = resolution;
canvas.height = resolution;
const ctx = canvas.getContext('webgpu');
if (ctx === null) showErrorAndExit('Your browser does not support WebGPU, or has it disabled. Enable it and reload the demo.');

const textureFormat = navigator.gpu.getPreferredCanvasFormat();
const adapter = await navigator.gpu.requestAdapter();
if (adapter === null) showErrorAndExit('GPU adapter is not available.');
console.log('Adapter max limits', adapter.limits);

const gpu = await adapter.requestDevice({
    requiredLimits: {
        maxBufferSize: adapter.limits.maxBufferSize,
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize
    }
});
ctx.configure({
    device: gpu,
    format: textureFormat,
    alphaMode: 'premultiplied',
});
console.log('GPU limits', gpu.limits);

// 4d position
const vertexStride = 4;
const vertexData: [number, number, number, number][] = [
    // as triangle strip
    [0, 0, 0, 1],
    [0, 1, 0, 1],
    [1, 0, 0, 1],
    [1, 1, 0, 1],
    [1, 1, 1, 1],
    [0, 1, 0, 1],
    [0, 1, 1, 1],
    [0, 0, 1, 1],
    [1, 1, 1, 1],
    [1, 0, 1, 1],
    [1, 0, 0, 1],
    [0, 0, 1, 1],
    [0, 0, 0, 1],
    [0, 1, 0, 1]
];
const vertexDataBuffer = new Float32Array(vertexData.flat().map((n) => n * 2 - 1));

const cameraProjectionMatrix = mat4.perspective(Math.PI / 3, 1, 1, 100);
const initialTransformMatrix = mat4.translate(mat4.identity(), new Float32Array([0, 0, -5])); // why identity? not really sure, haven't taken linear algebra yet lmao
const spinny = {
    lastFrame: performance.now(),
    enabled: true,
    theta: 0,
    phi: -Math.PI / 3,
    mouseDown: false,
};
const projectionMatrix = mat4.create();
function spinnyModelMatrix(): Float32Array {
    if (!spinny.mouseDown && spinny.enabled) spinny.theta += Math.PI * (performance.now() - spinny.lastFrame) / 2000;
    spinny.lastFrame = performance.now();
    mat4.multiply(
        cameraProjectionMatrix,
        mat4.rotateZ(mat4.rotateX(initialTransformMatrix, spinny.phi), spinny.theta),
        projectionMatrix
    );
    return projectionMatrix;
}
const okfineilladdathingfortouchmove = { x: 0, y: 0 }
document.addEventListener('mousedown', (e) => {
    if (e.button != 0) return;
    spinny.mouseDown = true;
    document.body.requestPointerLock();
});
document.addEventListener('mouseup', (e) => {
    if (e.button != 0) return;
    spinny.mouseDown = false;
    document.exitPointerLock();
});
document.addEventListener('touchstart', (e) => {
    spinny.mouseDown = true;
    okfineilladdathingfortouchmove.x = e.touches[0].clientX;
    okfineilladdathingfortouchmove.y = e.touches[0].clientY;
});
document.addEventListener('touchend', (e) => {
    if (e.touches.length == 0) spinny.mouseDown = false;
});
document.addEventListener('blur', () => {
    spinny.mouseDown = false;
    document.exitPointerLock();
});
document.addEventListener('mousemove', (e) => {
    if (spinny.mouseDown) {
        spinny.theta += e.movementX / 500;
        spinny.phi = Math.max(-Math.PI, Math.min(spinny.phi + e.movementY / 500, 0));
    }
});
document.addEventListener('touchmove', (e) => {
    if (spinny.mouseDown) {
        spinny.theta += (e.touches[0].clientX - okfineilladdathingfortouchmove.x) / 200;
        spinny.phi = Math.max(-Math.PI, Math.min(spinny.phi + (e.touches[0].clientY - okfineilladdathingfortouchmove.y) / 200, 0));
        okfineilladdathingfortouchmove.x = e.touches[0].clientX;
        okfineilladdathingfortouchmove.y = e.touches[0].clientY;
        e.preventDefault();
    }
});

const buffers = {
    vertices: gpu.createBuffer({
        label: 'Cube vertices',
        size: vertexDataBuffer.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    }),
    projection: gpu.createBuffer({
        label: 'Uniform projection buffer',
        size: mat4.create().byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })
};
gpu.queue.writeBuffer(buffers.vertices, 0, vertexDataBuffer);
const bindGroupLayout = gpu.createBindGroupLayout({
    entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' }
    }]
});
const bindGroup = gpu.createBindGroup({
    layout: bindGroupLayout,
    entries: [{
        binding: 0,
        resource: { buffer: buffers.projection }
    }]
});

const shaderModule = gpu.createShaderModule({ code: shaderCode });
const pipeline = gpu.createRenderPipeline({
    layout: gpu.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
        module: shaderModule,
        entryPoint: 'vertex_main',
        constants: {},
        buffers: [{
            arrayStride: vertexDataBuffer.BYTES_PER_ELEMENT * vertexStride,
            attributes: [{
                shaderLocation: 0,
                format: 'float32x4',
                offset: 0
            }],
            stepMode: 'vertex'
        }]
    },
    fragment: {
        module: shaderModule,
        entryPoint: 'fragment_main',
        constants: {},
        targets: [{
            format: textureFormat
        }]
    },
    primitive: {
        topology: 'triangle-strip',
        // stripIndexFormat: 'uint16',
        // commented because this is a weird mesh that might not cull correctly
        // cullMode: 'back'
    },
    depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus' // no negative depth i hope
        // apparently back-facing primitives can have different depth stencil operations
    }
});
const depthTexture = gpu.createTexture({
    size: [resolution, resolution],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT
});
const renderPassDescriptor = {
    colorAttachments: [{
        view: ctx.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 0 }
    }],
    depthStencilAttachment: {
        view: depthTexture.createView(),
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        depthClearValue: 1
    }
} satisfies GPURenderPassDescriptor;

let drawMode = 0;
document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    switch (key) {
        case ' ':
            spinny.enabled = !spinny.enabled;
            break;
        case '1':
            drawMode = drawMode == 1 ? 0 : 1;
            break;
        case '2':
            drawMode = drawMode == 2 ? 0 : 2;
            break;
    }
});
while (true) {
    await new Promise<void>((resolve) => {
        window.requestAnimationFrame(async () => {
            gpu.queue.writeBuffer(buffers.projection, 0, spinnyModelMatrix().buffer);
            renderPassDescriptor.colorAttachments[0].view = ctx.getCurrentTexture().createView();
            const encoder = gpu.createCommandEncoder();
            const renderPass = encoder.beginRenderPass(renderPassDescriptor);
            renderPass.setPipeline(pipeline);
            renderPass.setVertexBuffer(0, buffers.vertices);
            renderPass.setBindGroup(0, bindGroup);
            if (drawMode == 1) {
                // triangle mesh breakdown
                renderPass.draw(Math.floor(((performance.now() / 500) % (vertexData.length - 2)) + 3));
            } else if (drawMode == 2) {
                // individual triangles
                renderPass.draw(3, 1, Math.floor((performance.now() / 500) % (vertexData.length - 3)));
            } else {
                renderPass.draw(vertexData.length);
            }
            renderPass.end();
            gpu.queue.submit([encoder.finish()]);
            gpu.queue.onSubmittedWorkDone().then(() => resolve());
        });
    });
}