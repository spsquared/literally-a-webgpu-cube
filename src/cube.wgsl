@group(0) @binding(0)
var<uniform> projectionMatrix: mat4x4<f32>;

struct VertexIn {
    @location(0) position: vec4<f32>
}

struct VertexOut {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) frag_position: vec4<f32>
}

@vertex
fn vertex_main(vertex: VertexIn) -> VertexOut {
    var out: VertexOut;
    out.clip_position = projectionMatrix * vertex.position;
    out.frag_position = 0.5 * (vertex.position + vec4<f32>(1.0, 1.0, 1.0, 1.0));
    return out;
}

struct FragIn {
    @location(0) frag_position: vec4<f32>
}

@fragment
fn fragment_main(frag: FragIn) -> @location(0) vec4<f32> {
    return frag.frag_position;
}