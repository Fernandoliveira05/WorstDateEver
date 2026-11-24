Shader "WorstDateEver/StreetLightPool"
{
    SubShader
    {
        Tags { "Queue"="Transparent-20" "RenderType"="Transparent" }
        Blend SrcAlpha One
        ZWrite Off
        ColorMask RGB
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #include "UnityCG.cginc"
            struct AppData { float4 vertex : POSITION; half4 color : COLOR; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Interpolators { float4 clip : SV_POSITION; half4 color : COLOR; UNITY_VERTEX_OUTPUT_STEREO };
            Interpolators vert(AppData v)
            {
                Interpolators o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_OUTPUT(Interpolators,o);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.clip=UnityObjectToClipPos(v.vertex);
                o.color=v.color;
                return o;
            }
            half4 frag(Interpolators i) : SV_Target { return i.color; }
            ENDCG
        }
    }
}
