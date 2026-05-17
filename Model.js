function deg2rad(angle) {
  return (angle * Math.PI) / 180;
}

function Vertex(p) {
  this.p = p;
  this.normal = [];
  this.triangles = [];
}

function Triangle(v0, v1, v2) {
  this.v0 = v0;
  this.v1 = v1;
  this.v2 = v2;
  this.normal = [];
  this.tangent = [];
}

function Model(name) {
  this.name = name;
  this.iVertexBuffer = gl.createBuffer();
  this.iIndexBuffer = gl.createBuffer();
  this.count = 0;

  /**
   * @param {Float32Array}  vertices
   * @param {Uint16Array}   indices
   */
  this.BufferData = function (vertices, indices) {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);
    gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgram.iAttribVertex);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STREAM_DRAW);

    this.count = indices.length;
  };

  this.Draw = function () {
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
  };

  this.DrawWireframe = function () {
    let triangles = this.count / 3;
    for (let t = 0; t < triangles; t++) {
      gl.drawElements(gl.LINE_LOOP, 3, gl.UNSIGNED_SHORT, t * 3 * 2);
    }
  };
}

function CreateSurfaceData(data) {
  let vertices = [];
  let triangles = [];

  for (let i = 0, ang = 0; i < 72; i++, ang += 5) {
    vertices.push(
      new Vertex([Math.sin(deg2rad(ang)), 0, Math.cos(deg2rad(ang))]),
    );
  }

  for (let i = 0, ang = 0; i < 72; i++, ang += 5) {
    let v0ind = vertices.length;
    vertices.push(
      new Vertex([Math.sin(deg2rad(ang)), 1, Math.cos(deg2rad(ang))]),
    );

    if (i > 0) {
      let v1ind = v0ind - 72 - 1;
      let v2ind = v0ind - 1;
      let v3ind = v0ind - 72;

      let ti1 = triangles.length;
      triangles.push(new Triangle(v0ind, v1ind, v2ind));
      vertices[v0ind].triangles.push(ti1);
      vertices[v1ind].triangles.push(ti1);
      vertices[v2ind].triangles.push(ti1);

      let ti2 = triangles.length;
      triangles.push(new Triangle(v0ind, v3ind, v1ind));
      vertices[v0ind].triangles.push(ti2);
      vertices[v3ind].triangles.push(ti2);
      vertices[v1ind].triangles.push(ti2);
    }
  }

  data.verticesF32 = new Float32Array(vertices.length * 3);
  for (let i = 0; i < vertices.length; i++) {
    data.verticesF32[i * 3 + 0] = vertices[i].p[0];
    data.verticesF32[i * 3 + 1] = vertices[i].p[1];
    data.verticesF32[i * 3 + 2] = vertices[i].p[2];
  }

  data.indicesU16 = new Uint16Array(triangles.length * 3);
  for (let i = 0; i < triangles.length; i++) {
    data.indicesU16[i * 3 + 0] = triangles[i].v0;
    data.indicesU16[i * 3 + 1] = triangles[i].v1;
    data.indicesU16[i * 3 + 2] = triangles[i].v2;
  }
}

/**
 * @param {object} data
 * @param {number} radius
 * @param {number} uSteps
 * @param {number} vSteps
 */

function CreateSphereData(data, radius, uSteps, vSteps) {
    const verts   = [];
    const indices = [];

    for (let v = 0; v <= vSteps; v++) {
        const theta = v * Math.PI / vSteps;
        const sinT  = Math.sin(theta);
        const cosT  = Math.cos(theta);
 
        for (let u = 0; u <= uSteps; u++) {
            const phi  = u * 2 * Math.PI / uSteps;
            verts.push(
                radius * sinT * Math.cos(phi),
                radius * cosT,
                radius * sinT * Math.sin(phi)
            );
        }
    }

    for (let v = 0; v < vSteps; v++) {
        for (let u = 0; u < uSteps; u++) {
            const row  = uSteps + 1;
            const i0   = v * row + u;
            const i1   = i0 + 1;
            const i2   = i0 + row;
            const i3   = i2 + 1;
            indices.push(i0, i2, i1,   i1, i2, i3);
        }
    }
 
    data.verticesF32 = new Float32Array(verts);
    data.indicesU16  = new Uint16Array(indices);
}
