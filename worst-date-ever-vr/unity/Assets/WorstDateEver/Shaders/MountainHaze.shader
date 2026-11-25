Shader "WorstDateEver/MountainHaze"
{
    Properties
    {
        _Tint ("Rock tint", Color) = (.34,.42,.46,1)
        _TimeOfDay ("Time of day", Float) = 0
    }
    SubShader
    {
        Tags { "Queue"="Geometry" "RenderType"="Opaque" }
        Cull Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #pragma multi_compile_instancing
            #include "UnityCG.cginc"
            half4 _Tint;
            half _TimeOfDay;
            struct AppData { float4 vertex : POSITION; float3 normal : NORMAL; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Interpolators
            {
                float4 clip : SV_POSITION;
                float3 world : TEXCOORD0;
                float3 normal : TEXCOORD1;
                UNITY_VERTEX_OUTPUT_STEREO
            };
            Interpolators vert(AppData v)
            {
                Interpolators o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_OUTPUT(Interpolators,o);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.clip=UnityObjectToClipPos(v.vertex);
                o.world=mul(unity_ObjectToWorld,v.vertex).xyz;
                o.normal=UnityObjectToWorldNormal(v.normal);
                return o;
            }
            half4 frag(Interpolators i, fixed side : VFACE) : SV_Target
            {
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(i);
                half light=dot(normalize(i.normal)*(side>0 ? 1 : -1),half3(-.48,.78,-.39))*.30+.74;
                half depth=saturate((distance(i.world,_WorldSpaceCameraPos)-20)*.016);
                half ground=1-smoothstep(-.7,5.7,i.world.y);
                half haze=saturate(.16+depth*.37+ground*.36);
                half night=step(1.5,_TimeOfDay);
                half day=step(.5,_TimeOfDay)*(1-night);
                half3 sky=lerp(half3(.60,.62,.68),half3(.55,.66,.73),day);
                sky=lerp(sky,half3(.13,.17,.26),night);
                half3 rock=lerp(_Tint.rgb,half3(.093,.115,.17),night);
                return half4(lerp(rock*light,sky,haze),1);
            }
            ENDCG
        }
    }
}
