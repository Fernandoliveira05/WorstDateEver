using System.Linq;
using UnityEditor;
using UnityEngine;

namespace WorstDateEver.Editor
{
    public static partial class BuildBedroom
    {
        private static BedroomMaterialProfile FilledLinen;
        private static BedroomMaterialProfile CottonJersey;
        private static BedroomMaterialProfile HeavyKnit;
        private static BedroomMaterialProfile SoftRubber;
        private static BedroomMaterialProfile BouncyRubber;
        private static BedroomMaterialProfile CeramicGlaze;

        private static void LoadPhysicalMaterials()
        {
            FilledLinen = PhysicalMaterial("Filled Linen", BedroomMaterialProfile.Response.Flexible,
                .21f,.54f,.08f,p => { p.BendLimit = 23; p.BendSpring = .093f; p.BendDamping = .010f; });
            CottonJersey = PhysicalMaterial("Cotton Jersey", BedroomMaterialProfile.Response.Flexible,
                .065f,.65f,.025f,p => { p.BendLimit = 45; p.BendSpring = .013f; p.BendDamping = .004f; });
            HeavyKnit = PhysicalMaterial("Heavy Knit", BedroomMaterialProfile.Response.Flexible,
                .15f,.74f,.045f,p => { p.BendLimit = 32; p.BendSpring = .048f; p.BendDamping = .007f; });
            SoftRubber = PhysicalMaterial("Soft Rubber", BedroomMaterialProfile.Response.Flexible,
                .19f,.75f,.26f,p => { p.BendLimit = 22; p.BendSpring = .14f; p.BendDamping = .012f; });
            BouncyRubber = PhysicalMaterial("Bouncy Rubber", BedroomMaterialProfile.Response.Rebound,
                .035f,.31f,.77f);
            CeramicGlaze = PhysicalMaterial("Glazed Ceramic", BedroomMaterialProfile.Response.Brittle,
                .23f,.47f,.035f);
        }

        private static BedroomMaterialProfile PhysicalMaterial(string name, BedroomMaterialProfile.Response reaction,
            float mass, float friction, float bounce, System.Action<BedroomMaterialProfile> tune = null)
        {
            var path = Root + "/Materials/Physical/" + name + ".asset";
            var stored = AssetDatabase.LoadAssetAtPath<BedroomMaterialProfile>(path);
            if (stored) return stored;

            var profile = ScriptableObject.CreateInstance<BedroomMaterialProfile>();
            profile.name = name;
            profile.Behavior = reaction;
            profile.Mass = mass;
            profile.Surface = new PhysicsMaterial(name)
            {
                staticFriction = friction, dynamicFriction = friction*.83f, bounciness = bounce,
                bounceCombine = reaction == BedroomMaterialProfile.Response.Rebound
                    ? PhysicsMaterialCombine.Maximum : PhysicsMaterialCombine.Average
            };
            tune?.Invoke(profile);
            AssetDatabase.CreateAsset(profile,path);
            AssetDatabase.AddObjectToAsset(profile.Surface,profile);
            EditorUtility.SetDirty(profile);
            return profile;
        }

        private static void SetPhysicalMaterial(BedroomProp prop, BedroomMaterialProfile material)
        {
            prop.Material = material;
            material.Apply(prop.GetComponent<Rigidbody>(), prop.GetComponent<Collider>());
        }

        private static BedroomSoftBody MakeFlexible(BedroomProp prop, Vector3 size, BedroomMaterialProfile material, string meshPrefix)
        {
            if (material.Behavior != BedroomMaterialProfile.Response.Flexible)
                throw new System.ArgumentException("A flexible object requires a flexible material profile.");
            var root = prop.transform;
            var core = prop.GetComponent<Rigidbody>();
            var profile = prop.gameObject.AddComponent<BedroomSoftBody>();
            var visuals=root.GetComponentsInChildren<MeshFilter>()
                .Where(mesh=>mesh.TryGetComponent<MeshRenderer>(out var renderer)&&renderer.enabled).ToArray();
            var spacing = size.x * .34f;
            SetPhysicalMaterial(prop,material);
            core.mass *= 1f-2*material.EndMass;
            prop.GetComponent<BoxCollider>().size = Vector3.Scale(size,new Vector3(.49f,.83f,.87f));
            prop.SoftBody = profile;
            profile.Core = prop;
            profile.Ends = new[] { AddSoftEnd(-spacing), AddSoftEnd(spacing) };
            var bones = new[] { root, profile.Ends[0].transform, profile.Ends[1].transform };
            var garment = material==CottonJersey || material==HeavyKnit;
            if (garment)
            {
                var sheet=root.gameObject.AddComponent<BedroomGarment>();
                sheet.Item=profile;
                sheet.Bend=material==HeavyKnit?.105f:.031f;
                sheet.Damp=material==HeavyKnit?.83f:.88f;
                bones=new Transform[9];
                for(var row=0;row<3;row++)
                for(var column=0;column<3;column++)
                {
                    var index=row*3+column;
                    if(row==1) bones[index]=column==1?root:profile.Ends[column==0?0:1].transform;
                    else
                    {
                        var sample=new GameObject($"Tecido · {row+1}-{column+1}").transform;
                        sample.SetParent(root,false);
                        sample.localPosition=new Vector3((column-1)*spacing,0,(row-1)*size.z*.43f);
                        bones[index]=sample;
                    }
                }
                sheet.Bones=bones;
            }
            for (var i = 0; i < visuals.Length; i++)
                SkinPart(visuals[i],root,bones,size,(garment?"Woven-":"Structured-")+meshPrefix+i,material != SoftRubber);
            return profile;

            BedroomProp AddSoftEnd(float x)
            {
                var go = new GameObject(x < 0 ? "Borda esquerda" : "Borda direita");
                go.transform.SetParent(root,false);
                go.transform.localPosition = Vector3.right*x;
                var body = go.AddComponent<Rigidbody>();
                body.linearDamping = .45f;
                body.angularDamping = .60f;
                body.interpolation = RigidbodyInterpolation.Interpolate;
                body.collisionDetectionMode = CollisionDetectionMode.ContinuousSpeculative;
                var box = go.AddComponent<BoxCollider>();
                box.size = Vector3.Scale(size,new Vector3(.29f,.67f,.85f));
                var end = go.AddComponent<BedroomProp>();
                end.SoftBody = profile;
                SetPhysicalMaterial(end, material);
                body.mass *= material.EndMass;
                GrabTargets.Add(go);

                var joint = go.AddComponent<ConfigurableJoint>();
                joint.connectedBody = core;
                joint.autoConfigureConnectedAnchor = false;
                joint.anchor = Vector3.right*(-Mathf.Sign(x)*size.x*.125f);
                joint.connectedAnchor = Vector3.right*x + joint.anchor;
                joint.xMotion = joint.yMotion = joint.zMotion = ConfigurableJointMotion.Locked;
                joint.angularXMotion = joint.angularYMotion = joint.angularZMotion = ConfigurableJointMotion.Limited;
                joint.lowAngularXLimit = new SoftJointLimit { limit = -material.BendLimit*.5f };
                joint.highAngularXLimit = new SoftJointLimit { limit = material.BendLimit*.5f };
                joint.angularYLimit = new SoftJointLimit { limit = material.BendLimit*.55f };
                joint.angularZLimit = new SoftJointLimit { limit = material.BendLimit };
                joint.rotationDriveMode = RotationDriveMode.Slerp;
                joint.slerpDrive = new JointDrive
                {
                    positionSpring = material.BendSpring, positionDamper = material.BendDamping, maximumForce = 1
                };
                joint.projectionMode = JointProjectionMode.PositionAndRotation;
                joint.projectionDistance = .07f;
                joint.projectionAngle = 40;
                return end;
            }
        }

        private static BoneWeight SheetWeight(Vector3 point,Vector3 size)
        {
            var u=Mathf.Clamp(point.x/(size.x*.34f)+1,0,2);
            var v=Mathf.Clamp(point.z/(size.z*.43f)+1,0,2);
            var col=Mathf.Min(1,Mathf.FloorToInt(u));
            var row=Mathf.Min(1,Mathf.FloorToInt(v));
            u-=col;
            v-=row;
            var corner=row*3+col;
            var entries=new[] {(corner,(1-u)*(1-v)),(corner+1,u*(1-v)),(corner+3,(1-u)*v),(corner+4,u*v)};
            System.Array.Sort(entries,(a,b)=>b.Item2.CompareTo(a.Item2));
            return new BoneWeight
            {
                boneIndex0=entries[0].Item1,weight0=entries[0].Item2,
                boneIndex1=entries[1].Item1,weight1=entries[1].Item2,
                boneIndex2=entries[2].Item1,weight2=entries[2].Item2,
                boneIndex3=entries[3].Item1,weight3=entries[3].Item2
            };
        }

        private static void SkinPart(MeshFilter part, Transform root, Transform[] bones, Vector3 size, string name, bool textile)
        {
            var path = $"{Root}/Meshes/Soft-{name}.asset";
            var mesh = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (!mesh)
            {
                mesh = Object.Instantiate(part.sharedMesh);
                mesh.name = part.name;
                var vertices = mesh.vertices;
                var weights = new BoneWeight[vertices.Length];
                var uv = new Vector2[vertices.Length];
                var bindposes = new Matrix4x4[bones.Length];
                for (var i = 0; i < bones.Length; i++) bindposes[i] = bones[i].worldToLocalMatrix * part.transform.localToWorldMatrix;
                for (var i = 0; i < vertices.Length; i++)
                {
                    var rest = root.InverseTransformPoint(part.transform.TransformPoint(vertices[i]));
                    uv[i] = new Vector2(rest.x,rest.z+rest.y*.35f);
                    if (bones.Length==9)
                    {
                        weights[i]=SheetWeight(rest,size);
                        continue;
                    }
                    var x = rest.x / size.x;
                    var tipWeight = Mathf.SmoothStep(0,1,Mathf.InverseLerp(.075f,.46f,Mathf.Abs(x)));
                    var end = x<0 ? 1 : 2;
                    weights[i] = tipWeight > .5f
                        ? new BoneWeight { boneIndex0 = end, weight0 = tipWeight, boneIndex1 = 0, weight1 = 1-tipWeight }
                        : new BoneWeight { boneIndex0 = 0, weight0 = 1-tipWeight, boneIndex1 = end, weight1 = tipWeight };
                }
                mesh.uv = uv;
                mesh.bindposes = bindposes;
                mesh.boneWeights = weights;
                AssetDatabase.CreateAsset(mesh,path);
            }
            var node = part.gameObject;
            var visual = part.GetComponent<MeshRenderer>();
            var sharedMaterials = visual.sharedMaterials;
            if (textile)
            {
                for (var i = 0; i < sharedMaterials.Length; i++)
                {
                    var tint = sharedMaterials[i].color;
                    sharedMaterials[i] = SurfaceMaterial("Weave",tint,new(5,5),.42f,.12f,true);
                }
            }
            Object.DestroyImmediate(visual);
            Object.DestroyImmediate(part);
            var skin = node.AddComponent<SkinnedMeshRenderer>();
            skin.rootBone = root;
            skin.bones = bones;
            skin.sharedMesh = mesh;
            skin.sharedMaterials = sharedMaterials;
            skin.localBounds = new Bounds(Vector3.zero,size + Vector3.one*.36f);
        }
    }
}
